import { createServer } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { parseRemoteReferences, selectRemoteBranch } from './git-remote.mjs';
import { controlPlaneMcpToolCount, createControlPlaneMcpHandler } from './mcp.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = path.join(projectRoot, '.geekheros');
const stateFile = path.join(stateDir, 'state.json');
const backupRoot = path.join(stateDir, 'backups');
const sourceRoot = path.join(stateDir, 'sources');
const blueprintRoot = path.join(stateDir, 'blueprints');
const screenshotRoot = path.join(stateDir, 'screenshots');
const host = process.env.GEEKHEROS_AGENT_HOST || '127.0.0.1';
const port = Number(process.env.GEEKHEROS_AGENT_PORT || 8788);
const authToken = process.env.GEEKHEROS_AGENT_TOKEN;
const hostedDashboardOrigins = new Set([
  'https://geekheros-control-plane.heroiccrm.chatgpt.site',
  ...String(process.env.GEEKHEROS_DASHBOARD_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean),
]);
const privateNetworkAccessId = createHash('sha256').update(authToken || 'geekheros-local-agent').digest('hex').slice(0, 12).match(/.{2}/g).join(':');
const edgeNetwork = 'geekheros-edge';
const edgeContainer = 'geekheros-edge';
const managedLabel = 'com.geekheros.managed=true';
const wordpressImage = process.env.GEEKHEROS_WORDPRESS_IMAGE || 'wordpress:latest';
const cliImage = process.env.GEEKHEROS_WPCLI_IMAGE || 'wordpress:cli';
const databaseImage = process.env.GEEKHEROS_DATABASE_IMAGE || 'mariadb:lts';
const edgeImage = process.env.GEEKHEROS_EDGE_IMAGE || 'traefik:v3';
const localPreviewConfigMarker = 'GeekHeros local port preview';
const lovableMcpUrl = new URL('https://mcp.lovable.dev');
const lovableOAuthCallbackUrl = `http://127.0.0.1:${port}/lovable/oauth/callback`;
const lovableOAuthStateMaxAge = 10 * 60 * 1000;
const screenshotRefreshMs = 60 * 60 * 1000;
const uptimeCheckIntervalMs = 10 * 60 * 1000;
const screenshotCaptures = new Map();
const localPreviewConfig = String.raw`/* ${localPreviewConfigMarker} */
if (isset($_SERVER['HTTP_HOST']) && preg_match('/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/', $_SERVER['HTTP_HOST'])) {
  define('WP_HOME', 'http://' . $_SERVER['HTTP_HOST']);
  define('WP_SITEURL', 'http://' . $_SERVER['HTTP_HOST']);
}`;
const controlPlaneMuPlugin = String.raw`<?php
/**
 * Plugin Name: GeekHeros Control Plane
 * Description: Secure, one-time control-plane access for managed WordPress sites.
 * Version: 1.0.0
 */

defined( 'ABSPATH' ) || exit;

function geekheros_control_plane_login() {
    if ( 'POST' !== strtoupper( isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : '' ) ) {
        status_header( 405 );
        exit;
    }

    $token = isset( $_POST['geekheros_token'] ) ? sanitize_text_field( wp_unslash( $_POST['geekheros_token'] ) ) : '';
    if ( ! preg_match( '/^[A-Za-z0-9_-]{43}$/D', $token ) ) {
        wp_die( esc_html__( 'This login link is invalid.', 'geekheros' ), '', array( 'response' => 403 ) );
    }

    $transient = 'geekheros_login_' . hash( 'sha256', $token );
    $payload   = get_transient( $transient );
    delete_transient( $transient );
    $data = is_string( $payload ) ? json_decode( $payload, true ) : null;
    $user = is_array( $data ) && ! empty( $data['user_id'] ) ? get_user_by( 'id', (int) $data['user_id'] ) : false;

    if ( ! $user || ! user_can( $user, 'manage_options' ) ) {
        wp_die( esc_html__( 'This login link has expired or was already used.', 'geekheros' ), '', array( 'response' => 403 ) );
    }

    nocache_headers();
    header( 'Referrer-Policy: no-referrer' );
    wp_clear_auth_cookie();
    wp_set_current_user( $user->ID, $user->user_login );
    wp_set_auth_cookie( $user->ID, false, is_ssl() );
    do_action( 'wp_login', $user->user_login, $user );
    wp_safe_redirect( admin_url() );
    exit;
}

add_action( 'admin_post_nopriv_geekheros_login', 'geekheros_control_plane_login' );
add_action( 'admin_post_geekheros_login', 'geekheros_control_plane_login' );

add_filter( 'show_advanced_plugins', function ( $show, $type ) {
    return 'mustuse' === $type ? false : $show;
}, 10, 2 );
`;

if (!authToken || authToken.length < 24) {
  console.error('GEEKHEROS_AGENT_TOKEN must be set to a random value of at least 24 characters.');
  process.exit(1);
}

let stateQueue = Promise.resolve();
const stateReplaceRetryCodes = new Set(['EACCES', 'EBUSY', 'EPERM']);

function emptyState() {
  return { version: 7, sites: {}, clients: {}, blueprints: {}, activity: [], integrations: { lovable: {}, mcp: {} } };
}

async function readState() {
  await mkdir(stateDir, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(stateFile, 'utf8'));
    const sites = Object.fromEntries(Object.entries(parsed.sites || {}).map(([id, site]) => [id, {
      ...site,
      kind: site.kind === 'lovable' ? 'lovable' : 'wordpress',
      clientId: site.clientId || null,
      tags: Array.isArray(site.tags) ? site.tags : [],
    }]));
    const base = emptyState();
    return {
      ...base,
      ...parsed,
      version: 7,
      sites,
      clients: parsed.clients || {},
      blueprints: parsed.blueprints || {},
      activity: parsed.activity || [],
      integrations: {
        ...base.integrations,
        ...(parsed.integrations || {}),
        lovable: { ...(parsed.integrations?.lovable || {}) },
        mcp: { ...(parsed.integrations?.mcp || {}) },
      },
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyState();
    throw error;
  }
}

async function writeState(state) {
  await mkdir(stateDir, { recursive: true });
  const contents = `${JSON.stringify(state, null, 2)}\n`;
  const temporary = `${stateFile}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, 'utf8');
  try {
    let lastError;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      try {
        await rename(temporary, stateFile);
        return;
      } catch (error) {
        lastError = error;
        if (!stateReplaceRetryCodes.has(error?.code) || attempt === 6) break;
        await new Promise((resolve) => setTimeout(resolve, 25 * (2 ** attempt)));
      }
    }
    if (process.platform === 'win32' && stateReplaceRetryCodes.has(lastError?.code)) {
      // Windows scanners can briefly block replacement even when the file itself remains writable.
      await writeFile(stateFile, contents, 'utf8');
      return;
    }
    throw lastError;
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function updateState(mutator) {
  const task = stateQueue.then(async () => {
    const state = await readState();
    const result = await mutator(state);
    await writeState(state);
    return result;
  });
  stateQueue = task.catch(() => undefined);
  return task;
}

function lovableIntegration(state) {
  state.integrations ||= {};
  state.integrations.lovable ||= {};
  return state.integrations.lovable;
}

function mcpIntegration(state) {
  state.integrations ||= {};
  state.integrations.mcp ||= {};
  return state.integrations.mcp;
}

async function ensureMcpToken() {
  const current = mcpIntegration(await readState()).token;
  if (typeof current === 'string' && current.length >= 32) return current;
  return updateState((state) => {
    const integration = mcpIntegration(state);
    integration.token ||= randomBytes(32).toString('base64url');
    integration.createdAt ||= new Date().toISOString();
    return integration.token;
  });
}

function createLovableOAuthProvider(onAuthorizationUrl = () => undefined) {
  return {
    redirectUrl: lovableOAuthCallbackUrl,
    clientMetadata: {
      client_name: 'GeekHeros Control Plane',
      redirect_uris: [lovableOAuthCallbackUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'native',
    },
    state: async () => {
      const pending = lovableIntegration(await readState()).pending;
      if (!pending?.state) throw new Error('The Lovable authorization session has expired. Start the connection again.');
      return pending.state;
    },
    clientInformation: async () => lovableIntegration(await readState()).clientInformation,
    saveClientInformation: async (clientInformation) => updateState((state) => {
      lovableIntegration(state).clientInformation = clientInformation;
    }),
    tokens: async () => lovableIntegration(await readState()).tokens,
    saveTokens: async (tokens, context) => updateState((state) => {
      const integration = lovableIntegration(state);
      integration.tokens = { ...(integration.tokens || {}), ...tokens, issuer: context?.issuer || tokens.issuer };
      integration.connectedAt ||= new Date().toISOString();
    }),
    redirectToAuthorization: async (authorizationUrl) => onAuthorizationUrl(authorizationUrl),
    saveCodeVerifier: async (codeVerifier) => updateState((state) => {
      const integration = lovableIntegration(state);
      if (!integration.pending) throw new Error('The Lovable authorization session has expired. Start the connection again.');
      integration.pending.codeVerifier = codeVerifier;
    }),
    codeVerifier: async () => {
      const codeVerifier = lovableIntegration(await readState()).pending?.codeVerifier;
      if (!codeVerifier) throw new Error('The Lovable authorization session has expired. Start the connection again.');
      return codeVerifier;
    },
  };
}

function createLovableClient(provider = createLovableOAuthProvider()) {
  const transport = new StreamableHTTPClientTransport(lovableMcpUrl, { authProvider: provider });
  const client = new Client({ name: 'GeekHeros Control Plane', version: '0.1.0' });
  return { client, transport };
}

function lovableToolText(result) {
  const text = Array.isArray(result?.content)
    ? result.content.filter((item) => item?.type === 'text').map((item) => item.text).join('\n').trim()
    : '';
  if (result?.isError) throw new Error(text || 'Lovable returned an error.');
  return text;
}

function lovableToolPayload(result) {
  const text = lovableToolText(result);
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  if (text) {
    try { return JSON.parse(text); } catch { return { text }; }
  }
  return {};
}

function deepValue(value, keys, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return undefined;
  for (const key of keys) {
    if (Object.hasOwn(value, key) && value[key] !== undefined && value[key] !== null) return value[key];
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = deepValue(child, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function collectionFrom(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['workspaces', 'items', 'data', 'results']) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const child of Object.values(value)) {
    const collection = collectionFrom(child);
    if (collection.length) return collection;
  }
  return [];
}

function normalizeLovableIdentity(profilePayload, workspacePayload) {
  const accountSource = deepValue(profilePayload, ['user', 'profile', 'account']) || profilePayload || {};
  const rawWorkspaces = collectionFrom(workspacePayload).length
    ? collectionFrom(workspacePayload)
    : collectionFrom(deepValue(profilePayload, ['workspaces']));
  const workspaces = rawWorkspaces.map((workspace) => ({
    id: String(workspace?.id || workspace?.workspace_id || workspace?.workspaceId || ''),
    name: String(workspace?.name || workspace?.title || 'Lovable workspace'),
  })).filter((workspace) => workspace.id).slice(0, 100);
  return {
    account: {
      id: String(deepValue(accountSource, ['id', 'user_id', 'userId']) || ''),
      name: String(deepValue(accountSource, ['name', 'display_name', 'displayName']) || ''),
      email: String(deepValue(accountSource, ['email', 'user_email', 'userEmail']) || ''),
    },
    workspaces,
  };
}

async function readLovableIdentity(client) {
  const profile = lovableToolPayload(await client.callTool({ name: 'get_me', arguments: {} }));
  let workspacePayload = deepValue(profile, ['workspaces']) || {};
  try {
    workspacePayload = lovableToolPayload(await client.callTool({ name: 'list_workspaces', arguments: { limit: 100 } }));
  } catch {}
  return normalizeLovableIdentity(profile, workspacePayload);
}

async function withLovableClient(task, provider = createLovableOAuthProvider()) {
  const { client, transport } = createLovableClient(provider);
  try {
    await client.connect(transport);
    return await task(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function publicLovableConnection(integration) {
  return {
    connected: Boolean(integration?.tokens),
    account: integration?.profile?.account || null,
    workspaces: Array.isArray(integration?.profile?.workspaces) ? integration.profile.workspaces : [],
    connectedAt: integration?.connectedAt || null,
  };
}

async function getLovableConnection() {
  const integration = lovableIntegration(await readState());
  if (!integration.tokens) return publicLovableConnection(integration);
  try {
    const profile = await withLovableClient((client) => readLovableIdentity(client));
    await updateState((state) => { lovableIntegration(state).profile = profile; });
    return publicLovableConnection({ ...integration, profile });
  } catch (error) {
    return { ...publicLovableConnection(integration), connected: false, error: error.message || 'Lovable needs to be reconnected.' };
  }
}

async function startLovableConnection() {
  const pending = { state: randomBytes(32).toString('base64url'), startedAt: new Date().toISOString() };
  await updateState((state) => {
    const integration = lovableIntegration(state);
    delete integration.tokens;
    delete integration.profile;
    delete integration.connectedAt;
    integration.pending = pending;
  });
  let authorizationUrl = null;
  const provider = createLovableOAuthProvider((url) => { authorizationUrl = url; });
  try {
    await withLovableClient(() => undefined, provider);
  } catch (error) {
    if (!authorizationUrl) throw error;
  }
  if (!authorizationUrl) throw new Error('Lovable did not return an authorization URL.');
  return { authorizationUrl: authorizationUrl.toString() };
}

function safeTextMatch(left, right) {
  const leftHash = createHash('sha256').update(String(left || '')).digest();
  const rightHash = createHash('sha256').update(String(right || '')).digest();
  return timingSafeEqual(leftHash, rightHash);
}

async function finishLovableConnection(parameters) {
  const pending = lovableIntegration(await readState()).pending;
  const startedAt = Date.parse(pending?.startedAt || '');
  if (!pending?.state || !Number.isFinite(startedAt) || Date.now() - startedAt > lovableOAuthStateMaxAge) {
    throw Object.assign(new Error('This Lovable connection request expired. Return to GeekHeros and try again.'), { status: 400 });
  }
  if (!safeTextMatch(parameters.get('state'), pending.state)) {
    throw Object.assign(new Error('The Lovable connection could not be verified. Return to GeekHeros and try again.'), { status: 400 });
  }
  if (parameters.get('error')) {
    throw Object.assign(new Error('Lovable did not authorize the connection.'), { status: 400 });
  }
  const provider = createLovableOAuthProvider();
  const { client, transport } = createLovableClient(provider);
  try {
    await transport.finishAuth(parameters);
    await client.connect(transport);
    const profile = await readLovableIdentity(client);
    await updateState((state) => {
      const integration = lovableIntegration(state);
      integration.profile = profile;
      integration.connectedAt = new Date().toISOString();
      delete integration.pending;
    });
    return profile;
  } catch (error) {
    await updateState((state) => { delete lovableIntegration(state).pending; });
    throw error;
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function disconnectLovable() {
  const integration = lovableIntegration(await readState());
  const token = integration.tokens?.refresh_token || integration.tokens?.access_token;
  if (token) {
    const body = new URLSearchParams({ token });
    if (integration.clientInformation?.client_id) body.set('client_id', integration.clientInformation.client_id);
    if (integration.tokens?.refresh_token) body.set('token_type_hint', 'refresh_token');
    const response = await fetch('https://lovable.dev/oauth/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) throw new Error('Lovable could not revoke the connection. Try again.');
  }
  await updateState((state) => { state.integrations.lovable = { clientInformation: integration.clientInformation }; });
  return { connected: false, account: null, workspaces: [], connectedAt: null };
}

async function createLovableProject(input) {
  const initialMessage = String(input.initialMessage || '').trim();
  const workspaceId = String(input.workspaceId || '').trim();
  const wait = input.wait === true;
  if (!initialMessage || initialMessage.length > 100_000) throw Object.assign(new Error('Enter a Lovable prompt up to 100,000 characters.'), { status: 400 });
  if (workspaceId.length > 200) throw Object.assign(new Error('Choose a valid Lovable workspace.'), { status: 400 });
  const created = await withLovableClient(async (client) => {
    const result = lovableToolPayload(await client.callTool({
      name: 'create_project',
      arguments: {
        initial_message: initialMessage,
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
        wait,
        ...(wait ? { timeout_seconds: 600 } : {}),
      },
    }, wait ? { timeout: 610_000, resetTimeoutOnProgress: true } : undefined));
    const projectId = String(deepValue(result, ['projectId', 'project_id']) || '');
    if (!projectId) throw new Error('Lovable needs a workspace selection before it can create this project.');
    let details = {};
    try { details = lovableToolPayload(await client.callTool({ name: 'get_project', arguments: { project_id: projectId } })); } catch {}
    return {
      id: projectId,
      name: String(deepValue(details, ['name', 'title']) || deepValue(result, ['name', 'title']) || 'Lovable project'),
      editorUrl: String(deepValue(details, ['editor_url', 'editorUrl']) || deepValue(result, ['editor_url', 'editorUrl']) || ''),
      previewUrl: String(deepValue(details, ['preview_url', 'previewUrl']) || deepValue(result, ['preview_url', 'previewUrl']) || ''),
      messageId: String(deepValue(result, ['message_id', 'messageId']) || ''),
      sourceRevision: String(deepValue(details, ['latest_commit_sha', 'latestCommitSha', 'commit_sha', 'commitSha']) || ''),
      status: String(deepValue(details, ['status', 'build_status', 'buildStatus']) || deepValue(result, ['status']) || ''),
    };
  });
  return created;
}

async function docker(args, options = {}) {
  try {
    const result = await execFileAsync('docker', args, {
      encoding: 'utf8',
      maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
      timeout: options.timeout || 120_000,
      windowsHide: true,
    });
    return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    const rawDetail = String(error?.stderr || error?.stdout || error?.message || 'Docker command failed')
      .replace(/password[^\s]*/gi, 'password=[redacted]')
      .trim();
    const detail = rawDetail.length > 2_400 ? `…${rawDetail.slice(-2_400)}` : rawDetail;
    const wrapped = new Error(detail || 'Docker command failed');
    wrapped.code = error?.code;
    throw wrapped;
  }
}

async function git(args, options = {}) {
  try {
    const result = await execFileAsync('git', args, {
      encoding: 'utf8',
      maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
      timeout: options.timeout || 600_000,
      windowsHide: true,
    });
    return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    let detail = String(error?.stderr || error?.stdout || error?.message || 'Git command failed');
    if (options.secret) detail = detail.replaceAll(options.secret, '[redacted]');
    throw new Error(detail.trim().slice(0, 800) || 'Git command failed');
  }
}

async function dockerToFile(args, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = createWriteStream(destination);
    let stderr = '';
    child.stdout.pipe(output);
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      output.end();
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(0, 800) || `Docker exited with code ${code}`));
    });
  });
}

async function dockerFromBuffer(args, contents, timeout = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error('Docker input operation timed out.'));
      }
    }, timeout);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(stderr.trim().slice(0, 800) || `Docker exited with code ${code}`));
    });
    child.stdin.end(contents);
  });
}

async function dockerFromFile(args, source, timeout = 600_000) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const input = createReadStream(source);
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error('Docker file import timed out.'));
      }
    }, timeout);
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    input.on('error', (error) => {
      child.kill();
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(0, 800) || `Docker exited with code ${code}`));
    });
    input.pipe(child.stdin);
  });
}

async function inspectContainer(name) {
  try {
    const { stdout } = await docker(['container', 'inspect', name], { timeout: 30_000 });
    return JSON.parse(stdout)[0];
  } catch (error) {
    if (/No such (object|container)/i.test(error.message)) return null;
    throw error;
  }
}

async function resourceExists(type, name) {
  try {
    await docker([type, 'inspect', name], { timeout: 30_000 });
    return true;
  } catch (error) {
    if (/No such|not found/i.test(error.message)) return false;
    throw error;
  }
}

async function ensureNetwork(name, labels = []) {
  if (await resourceExists('network', name)) return;
  const args = ['network', 'create'];
  for (const label of labels) args.push('--label', label);
  args.push(name);
  await docker(args);
}

async function ensureVolume(name, siteId) {
  if (await resourceExists('volume', name)) return;
  await docker(['volume', 'create', '--label', managedLabel, '--label', `com.geekheros.site.id=${siteId}`, name]);
}

async function ensureEdge() {
  await ensureNetwork(edgeNetwork, [managedLabel, 'com.geekheros.role=edge']);
  const existing = await inspectContainer(edgeContainer);
  if (existing) {
    if (existing.Config?.Labels?.['com.geekheros.managed'] !== 'true') {
      throw new Error(`A container named ${edgeContainer} already exists and is not managed by GeekHeros.`);
    }
    if (!existing.State?.Running) await docker(['start', edgeContainer]);
    return;
  }

  await docker([
    'run', '-d', '--name', edgeContainer, '--restart', 'unless-stopped',
    '--network', edgeNetwork,
    '--label', managedLabel,
    '--label', 'com.geekheros.role=edge',
    '-p', '80:80', '-p', '443:443',
    '-v', '/var/run/docker.sock:/var/run/docker.sock:ro',
    edgeImage,
    '--providers.docker=true',
    '--providers.docker.exposedbydefault=false',
    `--providers.docker.network=${edgeNetwork}`,
    '--entrypoints.web.address=:80',
    '--entrypoints.websecure.address=:443',
    '--api.dashboard=false',
    '--log.level=INFO',
  ], { timeout: 600_000 });
}

function slugify(value) {
  const slug = value.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  return slug || 'wordpress';
}

function normalizeDomain(value) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

function parseReferenceUrls(value, type) {
  const values = (Array.isArray(value) ? value : String(value || '').split(/[\r\n,]+/))
    .map((item) => String(item || '').trim()).filter(Boolean);
  return values.map((item) => {
    let parsed;
    try { parsed = new URL(item); } catch { throw new Error(`Enter a valid public ${type} URL.`); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.hostname === 'localhost' || /^127\./.test(parsed.hostname)) {
      throw new Error(`Lovable ${type} references must use a public HTTP or HTTPS URL.`);
    }
    if (type === 'image' && /\.(?:svg|gif)(?:$|[?#])/i.test(parsed.pathname + parsed.search + parsed.hash)) throw new Error('Lovable image references must be JPEG, PNG or WebP URLs.');
    return parsed.toString();
  });
}

function validateRepositoryUrl(value) {
  if (!String(value || '').trim()) return null;
  let repository;
  try { repository = new URL(String(value).trim()); } catch { throw new Error('Enter a valid Git repository URL or leave it blank to use Lovable directly.'); }
  if (repository.protocol !== 'https:' || repository.username || repository.password || !['github.com', 'gitlab.com'].includes(repository.hostname.toLowerCase())) {
    throw new Error('Use a credential-free HTTPS GitHub or GitLab repository URL.');
  }
  return repository.toString().replace(/\/$/, '');
}

function buildLovableUrl(prompt, images, html) {
  const parameters = new URLSearchParams({ prompt });
  for (const image of images) parameters.append('images', image);
  for (const page of html) parameters.append('html', page);
  return `https://lovable.dev/?autosubmit=true#${parameters.toString()}`;
}

function validateLovableProjectUrl(value) {
  if (!value) return '';
  let projectUrl;
  try { projectUrl = new URL(String(value).trim()); } catch { throw new Error('The Lovable project URL is invalid.'); }
  if (projectUrl.protocol !== 'https:' || !/(^|\.)lovable\.dev$/i.test(projectUrl.hostname)) {
    throw new Error('Use a secure lovable.dev project URL.');
  }
  return projectUrl.toString();
}

function validateBuildEnvironment(value) {
  const entries = {};
  const lines = String(value || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) throw new Error('Build environment entries must use KEY=value, one per line.');
    const key = trimmed.slice(0, separator).trim();
    const entryValue = trimmed.slice(separator + 1);
    if (!/^VITE_[A-Z0-9_]{1,80}$/.test(key)) throw new Error('Lovable frontend build variables must begin with VITE_ and use uppercase letters, numbers or underscores.');
    if (entryValue.length > 4000 || /[\u0000\r\n]/.test(entryValue)) throw new Error(`The value for ${key} is invalid.`);
    entries[key] = entryValue;
  }
  if (Object.keys(entries).length > 50) throw new Error('Use no more than 50 Lovable build variables.');
  return entries;
}

function validateSiteInput(input) {
  const name = String(input.name || '').trim();
  const domain = normalizeDomain(String(input.domain || ''));
  const kind = input.kind === 'lovable' ? 'lovable' : 'wordpress';
  const pod = ['Micro', 'Standard', 'Performance', 'Power'].includes(input.pod) ? input.pod : 'Standard';
  if (!name || name.length > 80) throw new Error('Enter a site name up to 80 characters.');
  if (!domain || domain.length > 253 || !/^(?=.{1,253}$)(localhost|([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,62})$/.test(domain)) {
    throw new Error('Enter a valid hostname, such as client.example.com or client.localhost.');
  }
  if (kind === 'lovable') {
    const prompt = String(input.lovablePrompt || '').trim();
    if (!prompt || prompt.length > 50_000) throw new Error('Enter a Lovable prompt up to 50,000 characters.');
    const images = parseReferenceUrls(input.imageUrls, 'image');
    const html = parseReferenceUrls(input.htmlUrls, 'page');
    if (images.length + html.length > 10) throw new Error('Lovable supports up to 10 combined image and page references.');
    const repositoryUrl = validateRepositoryUrl(input.repositoryUrl);
    const sourceProvider = input.sourceProvider === 'git' ? 'git' : 'lovable';
    if (sourceProvider === 'git' && !repositoryUrl) throw new Error('Enter a Git repository URL when Git is the selected source.');
    const branch = String(input.repositoryBranch || '').trim();
    if (branch && (branch.length > 200 || branch.includes('..') || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch))) throw new Error('Enter a valid Git branch name or leave it blank to detect the repository default.');
    const repositoryToken = String(input.repositoryToken || '').trim();
    if (repositoryToken.length > 500) throw new Error('The repository access token is too long.');
    const lovableProjectId = String(input.lovableProjectId || '').trim();
    if (lovableProjectId.length > 200) throw new Error('The Lovable project ID is invalid.');
    const lovableWorkspaceId = String(input.lovableWorkspaceId || '').trim();
    if (lovableWorkspaceId.length > 200) throw new Error('The Lovable workspace ID is invalid.');
    const lovableProjectUrl = validateLovableProjectUrl(input.lovableProjectUrl);
    return {
      name, domain, kind, pod, region: 'Local Docker', sourceProvider, repositoryUrl, repositoryBranch: branch || null,
      repositoryToken, lovablePrompt: prompt, lovableProjectId, lovableWorkspaceId,
      lovableBuildUrl: lovableProjectUrl || buildLovableUrl(prompt, images, html),
      lovableReferences: { images, html }, buildEnvironment: validateBuildEnvironment(input.buildEnvironment),
    };
  }
  const adminUser = String(input.adminUser || '').trim();
  const adminEmail = String(input.adminEmail || '').trim().toLowerCase();
  const adminPassword = String(input.adminPassword || '');
  if (!/^[A-Za-z0-9_.-]{1,60}$/.test(adminUser)) throw new Error('The admin username may contain letters, numbers, dots, dashes and underscores.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('Enter a valid administrator email address.');
  if (adminPassword.length < 12) throw new Error('Use an administrator password with at least 12 characters.');
  const blueprintId = String(input.blueprintId || '').trim();
  if (blueprintId && !/^blueprint_[a-f0-9]{12}$/.test(blueprintId)) throw new Error('Choose a valid WordPress blueprint.');
  return { name, domain, kind, adminUser, adminEmail, adminPassword, blueprintId: blueprintId || null, pod, region: 'Local Docker' };
}

function validateTags(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const tags = [];
  for (const item of source) {
    const tag = String(item || '').trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    if (tag.length > 32) throw new Error('Tags may be up to 32 characters each.');
    if (!/^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u.test(tag)) throw new Error(`Tag "${tag}" contains unsupported characters.`);
    if (!tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }
  if (tags.length > 20) throw new Error('A site may have up to 20 tags.');
  return tags;
}

function validateClientInput(input, partial = false) {
  const values = {};
  if (!partial || Object.hasOwn(input, 'name')) {
    const name = String(input.name || '').trim();
    if (!name || name.length > 100) throw new Error('Enter a client name up to 100 characters.');
    values.name = name;
  }
  for (const [field, max] of [['company', 120], ['email', 160], ['phone', 60], ['notes', 1000]]) {
    if (!partial || Object.hasOwn(input, field)) {
      const value = String(input[field] || '').trim();
      if (value.length > max) throw new Error(`${field[0].toUpperCase()}${field.slice(1)} is too long.`);
      values[field] = value;
    }
  }
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error('Enter a valid client email address.');
  return values;
}

const blueprintFileRules = {
  plugin: { extension: '.zip', label: 'plugin ZIP' },
  theme: { extension: '.zip', label: 'theme ZIP' },
  settings: { extension: '.json', label: 'settings JSON' },
  content: { extension: '.xml', label: 'WordPress export XML' },
  'mu-plugin': { extension: '.php', label: 'must-use plugin PHP' },
  'wp-content': { extension: null, label: 'wp-content file' },
};
const blueprintMaxFileBytes = 25 * 1024 * 1024;
const blueprintMaxTotalBytes = 75 * 1024 * 1024;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeBlueprintSlugs(value, label, maximum = 100) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/);
  const slugs = [];
  for (const item of source) {
    const slug = String(typeof item === 'object' && item ? item.slug : item || '').trim().toLowerCase();
    if (!slug) continue;
    if (!/^[a-z0-9][a-z0-9-]{0,190}$/.test(slug)) throw new Error(`The ${label} slug "${slug}" is invalid.`);
    const activate = typeof item === 'object' && item ? item.activate !== false : true;
    if (!slugs.some((entry) => entry.slug === slug)) slugs.push({ slug, activate });
  }
  if (slugs.length > maximum) throw new Error(`A blueprint may include up to ${maximum} ${label} entries.`);
  return slugs;
}

function normalizeBlueprintSettings(value) {
  if (!isPlainObject(value)) throw new Error('Blueprint settings JSON must contain an object.');
  const unsupported = Object.keys(value).filter((key) => !['options', 'plugins', 'themes', 'pages'].includes(key));
  if (unsupported.length) throw new Error(`Blueprint settings JSON contains unsupported fields: ${unsupported.join(', ')}.`);
  const options = isPlainObject(value.options) ? value.options : {};
  const optionEntries = Object.entries(options);
  if (optionEntries.length > 200) throw new Error('Blueprint settings may update up to 200 WordPress options.');
  for (const [key, optionValue] of optionEntries) {
    if (!/^[A-Za-z0-9_.:-]{1,191}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(`The WordPress option "${key}" is invalid.`);
    if (JSON.stringify(optionValue).length > 8_000) throw new Error(`The WordPress option "${key}" is too large.`);
  }
  const pages = Array.isArray(value.pages) ? value.pages.map((page, index) => {
    if (!isPlainObject(page)) throw new Error(`Blueprint page ${index + 1} must be an object.`);
    const title = String(page.title || '').trim();
    const content = String(page.content || '');
    const slug = String(page.slug || '').trim();
    const status = String(page.status || 'publish').trim();
    const template = String(page.template || '').trim();
    if (!title || title.length > 200) throw new Error(`Blueprint page ${index + 1} needs a title up to 200 characters.`);
    if (content.length > 8_000) throw new Error(`Blueprint page "${title}" is too large; use a WordPress export XML file for larger content.`);
    if (slug && !/^[a-z0-9][a-z0-9-]{0,190}$/.test(slug)) throw new Error(`Blueprint page "${title}" has an invalid slug.`);
    if (!['draft', 'pending', 'private', 'publish'].includes(status)) throw new Error(`Blueprint page "${title}" has an invalid status.`);
    if (template.length > 190 || /[\\/]/.test(template)) throw new Error(`Blueprint page "${title}" has an invalid template.`);
    return { title, content, slug, status, template };
  }) : [];
  if (pages.length > 100) throw new Error('Blueprint settings may create up to 100 pages.');
  return {
    options,
    plugins: normalizeBlueprintSlugs(value.plugins || [], 'plugin'),
    themes: normalizeBlueprintSlugs(value.themes || [], 'theme', 20),
    pages,
  };
}

function cleanBlueprintFileName(value) {
  const name = path.basename(String(value || '')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  if (!name || name === '.' || name === '..' || name.length > 180) throw new Error('A blueprint file has an invalid name.');
  return name;
}

function cleanBlueprintDestination(value, name) {
  const raw = String(value || `wp-content/blueprint-files/${name}`).replace(/\\/g, '/').trim();
  const segments = raw.split('/');
  if (!raw || raw.startsWith('/') || raw.length > 300 || /[\u0000-\u001f]/.test(raw) || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${name} has an invalid wp-content destination.`);
  }
  const destination = path.posix.normalize(raw);
  if (!destination.startsWith('wp-content/')) throw new Error(`${name} must be placed inside wp-content.`);
  const protectedDestination = destination.toLowerCase();
  if (protectedDestination === 'wp-content/mu-plugins/geekheros-control-plane.php' || segments.some((segment) => segment.toLowerCase().startsWith('.geekheros-blueprint-'))) {
    throw new Error(`${name} cannot overwrite GeekHeros control files.`);
  }
  return destination;
}

function decodeBlueprintFile(file) {
  const kind = String(file?.kind || '');
  const rule = blueprintFileRules[kind];
  if (!rule) throw new Error('Choose a supported purpose for every blueprint file.');
  const name = cleanBlueprintFileName(file?.name);
  if (rule.extension && path.extname(name).toLowerCase() !== rule.extension) throw new Error(`${name} must be a ${rule.label}.`);
  const destination = kind === 'wp-content' ? cleanBlueprintDestination(file?.destination, name) : '';
  const encoded = String(file?.content || '').replace(/\s/g, '');
  if (!encoded || encoded.length > Math.ceil(blueprintMaxFileBytes * 4 / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error(`${name} is not a valid upload.`);
  const contents = Buffer.from(encoded, 'base64');
  if (!contents.length || contents.length > blueprintMaxFileBytes || contents.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) throw new Error(`${name} is not a valid upload.`);
  if (rule.extension === '.zip' && !['504b0304', '504b0506', '504b0708'].includes(contents.subarray(0, 4).toString('hex'))) throw new Error(`${name} is not a valid ZIP archive.`);
  if (rule.extension === '.json') {
    let settings;
    try { settings = JSON.parse(contents.toString('utf8')); } catch { throw new Error(`${name} must contain valid JSON.`); }
    normalizeBlueprintSettings(settings);
  }
  if (rule.extension === '.xml' && !contents.subarray(0, Math.min(contents.length, 4096)).toString('utf8').includes('<')) throw new Error(`${name} is not a valid XML file.`);
  if (rule.extension === '.php' && !contents.subarray(0, Math.min(contents.length, 4096)).toString('utf8').includes('<?php')) throw new Error(`${name} must contain a PHP opening tag.`);
  return { kind, name, destination, contents };
}

function publicBlueprint(blueprint, sites = []) {
  const files = Array.isArray(blueprint.files) ? blueprint.files.map((file) => ({
    id: file.id, name: file.name, kind: file.kind, destination: file.destination || '',
    size: Number(file.size || 0), sha256: file.sha256,
  })) : [];
  return {
    id: blueprint.id,
    name: blueprint.name,
    description: blueprint.description || '',
    plugins: Array.isArray(blueprint.plugins) ? blueprint.plugins : [],
    themes: Array.isArray(blueprint.themes) ? blueprint.themes : [],
    files,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + Number(file.size || 0), 0),
    usageCount: sites.filter((site) => site.blueprintId === blueprint.id).length,
    createdAt: blueprint.createdAt,
    updatedAt: blueprint.updatedAt,
  };
}

async function listBlueprints() {
  const state = await readState();
  const sites = Object.values(state.sites);
  return Object.values(state.blueprints).map((blueprint) => publicBlueprint(blueprint, sites))
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

async function createBlueprint(input) {
  const name = String(input.name || '').trim();
  const description = String(input.description || '').trim();
  if (!name || name.length > 100) throw Object.assign(new Error('Enter a blueprint name up to 100 characters.'), { status: 400 });
  if (description.length > 500) throw Object.assign(new Error('Blueprint descriptions may be up to 500 characters.'), { status: 400 });
  let plugins;
  let themes;
  try {
    plugins = normalizeBlueprintSlugs(input.plugins || [], 'plugin');
    themes = normalizeBlueprintSlugs(input.themes || [], 'theme', 20);
  } catch (error) {
    throw Object.assign(error, { status: 400 });
  }
  const sourceFiles = Array.isArray(input.files) ? input.files : [];
  if (sourceFiles.length > 25) throw Object.assign(new Error('A blueprint may contain up to 25 uploaded files.'), { status: 400 });
  if (!plugins.length && !themes.length && !sourceFiles.length) throw Object.assign(new Error('Add at least one plugin, theme, settings file, content export or must-use plugin.'), { status: 400 });
  let decodedFiles;
  try { decodedFiles = sourceFiles.map(decodeBlueprintFile); } catch (error) { throw Object.assign(error, { status: 400 }); }
  const totalBytes = decodedFiles.reduce((sum, file) => sum + file.contents.length, 0);
  if (totalBytes > blueprintMaxTotalBytes) throw Object.assign(new Error('Blueprint uploads may total up to 75 MB.'), { status: 413 });
  const id = `blueprint_${randomBytes(6).toString('hex')}`;
  const directory = path.join(blueprintRoot, id);
  const now = new Date().toISOString();
  await mkdir(directory, { recursive: true });
  let blueprint;
  try {
    const files = [];
    for (const file of decodedFiles) {
      const fileId = randomBytes(8).toString('hex');
      const storageName = `${fileId}${path.extname(file.name).toLowerCase()}`;
      await writeFile(path.join(directory, storageName), file.contents);
      files.push({ id: fileId, name: file.name, kind: file.kind, destination: file.destination, size: file.contents.length, sha256: createHash('sha256').update(file.contents).digest('hex'), storageName });
    }
    blueprint = { id, name, description, plugins, themes, files, createdAt: now, updatedAt: now };
    await updateState((state) => { state.blueprints[id] = blueprint; });
  } catch (error) {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
    throw error;
  }
  await recordActivity({ siteId: '', siteName: name, type: 'blueprint.create', message: `${name} was saved as a WordPress blueprint.` }).catch((error) => console.error('Unable to record blueprint creation:', error.message));
  return publicBlueprint(blueprint);
}

async function deleteBlueprint(blueprintId) {
  const blueprint = await updateState((state) => {
    const current = state.blueprints[blueprintId];
    if (!current) throw Object.assign(new Error('Blueprint not found.'), { status: 404 });
    if (Object.values(state.sites).some((site) => site.blueprintId === blueprintId)) throw Object.assign(new Error('This blueprint is used by a managed site and cannot be removed.'), { status: 409 });
    delete state.blueprints[blueprintId];
    return current;
  });
  await rm(path.join(blueprintRoot, blueprintId), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await recordActivity({ siteId: '', siteName: blueprint.name, type: 'blueprint.delete', message: `${blueprint.name} was removed from WordPress blueprints.` }).catch((error) => console.error('Unable to record blueprint deletion:', error.message));
  return { deleted: true };
}

function validatePackageNames(value) {
  const names = Array.isArray(value) ? value.map(String) : [];
  if (!names.length) return [];
  if (names.length > 100 || names.some((name) => !/^[a-z0-9][a-z0-9._-]{0,190}$/i.test(name))) {
    throw new Error('One or more package names are invalid.');
  }
  return [...new Set(names)];
}

function limitsForPod(pod) {
  return {
    Micro: ['--cpus', '0.5', '--memory', '512m'],
    Standard: ['--cpus', '1', '--memory', '1g'],
    Performance: ['--cpus', '2', '--memory', '2g'],
    Power: ['--cpus', '4', '--memory', '4g'],
  }[pod] || ['--cpus', '1', '--memory', '1g'];
}

async function recordActivity(entry) {
  await updateState((state) => {
    state.activity.unshift({ id: randomUUID(), createdAt: new Date().toISOString(), state: 'completed', ...entry });
    state.activity = state.activity.slice(0, 100);
  });
}

async function setSiteState(siteId, patch) {
  await updateState((state) => {
    if (state.sites[siteId]) Object.assign(state.sites[siteId], patch, { updatedAt: new Date().toISOString() });
  });
}

async function waitForDatabase(site, timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await docker(['exec', '-e', `MYSQL_PWD=${site.secrets.dbRootPassword}`, site.dbContainer, 'mariadb-admin', 'ping', '-h127.0.0.1', '-uroot', '--silent'], { timeout: 15_000 });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
  throw new Error('The WordPress database did not become ready in time.');
}

async function waitForWordPressFiles(site, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await docker(['exec', site.wpContainer, 'test', '-f', '/var/www/html/wp-config.php'], { timeout: 10_000 });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error('The WordPress container did not finish preparing its files.');
}

function wpCliArgs(site, command) {
  return [
    // The Apache WordPress image owns its shared volume as www-data (33:33).
    // wordpress:cli uses a different www-data UID, so without this override it
    // can read WordPress but cannot create wp-content/upgrade or install packages.
    'run', '--rm', '--user', '33:33', '--network', site.network, '--volumes-from', site.wpContainer,
    '-e', 'WORDPRESS_DB_HOST=db:3306',
    '-e', 'WORDPRESS_DB_NAME=wordpress',
    '-e', 'WORDPRESS_DB_USER=wordpress',
    '-e', `WORDPRESS_DB_PASSWORD=${site.secrets.dbPassword}`,
    cliImage,
    'wp',
    ...command,
  ];
}

async function runWp(site, command, options = {}) {
  return docker(wpCliArgs(site, command), { timeout: options.timeout || 300_000, maxBuffer: 32 * 1024 * 1024 });
}

async function installBlueprintSlug(site, packageType, entry) {
  const installed = (await listWpPackages(site, packageType)).find((item) => item.name === entry.slug);
  if (installed) {
    if (entry.activate !== false && installed.status !== 'active' && installed.status !== 'must-use') {
      await runWp(site, [packageType, 'activate', entry.slug], { timeout: 120_000 });
    }
    return;
  }
  const command = [packageType, 'install', entry.slug, '--force'];
  if (entry.activate !== false) command.push('--activate');
  await runWp(site, command, { timeout: 600_000 });
}

async function listWpPackages(site, packageType) {
  const { stdout } = await runWp(site, [packageType, 'list', '--format=json'], { timeout: 120_000 });
  const packages = parseJsonOutput(stdout, []);
  if (!Array.isArray(packages)) throw new Error(`WordPress returned an invalid ${packageType} inventory.`);
  return packages.filter((entry) => entry && typeof entry.name === 'string' && entry.name);
}

async function installBlueprintArchive(site, packageType, stagedFile, displayName) {
  const before = new Map((await listWpPackages(site, packageType)).map((entry) => [entry.name, entry]));
  await runWp(site, [packageType, 'install', stagedFile, '--force'], { timeout: 600_000 });

  const after = await listWpPackages(site, packageType);
  let installed = after.filter((entry) => !before.has(entry.name));
  if (!installed.length) {
    installed = after.filter((entry) => before.get(entry.name)?.version !== entry.version);
  }
  if (!installed.length) {
    throw new Error(`${displayName} was extracted, but WordPress could not identify the installed ${packageType}.`);
  }

  if (packageType === 'theme') {
    if (installed.length !== 1) throw new Error(`${displayName} must contain exactly one WordPress theme.`);
    if (installed[0].status !== 'active') await runWp(site, ['theme', 'activate', installed[0].name], { timeout: 120_000 });
  } else {
    const inactive = installed.filter((entry) => entry.status !== 'active' && entry.status !== 'must-use').map((entry) => entry.name);
    if (inactive.length) await runWp(site, ['plugin', 'activate', ...inactive], { timeout: 120_000 });
  }
}

function blueprintPageSlug(page) {
  if (page.slug) return page.slug;
  return page.title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 190) || `page-${createHash('sha256').update(page.title).digest('hex').slice(0, 12)}`;
}

async function applyBlueprintSettings(site, rawSettings) {
  const settings = normalizeBlueprintSettings(rawSettings);
  for (const plugin of settings.plugins) await installBlueprintSlug(site, 'plugin', plugin);
  for (const theme of settings.themes) await installBlueprintSlug(site, 'theme', theme);
  for (const [key, value] of Object.entries(settings.options)) {
    await runWp(site, ['option', 'update', key, JSON.stringify(value), '--format=json'], { timeout: 120_000 });
  }
  for (const page of settings.pages) {
    const slug = blueprintPageSlug(page);
    let existingId = '';
    try { existingId = (await runWp(site, ['post', 'list', '--post_type=page', `--name=${slug}`, '--field=ID'], { timeout: 90_000 })).stdout.split(/\s+/)[0] || ''; } catch {}
    const command = ['post', existingId ? 'update' : 'create'];
    if (existingId) command.push(existingId);
    command.push('--post_type=page', `--post_title=${page.title}`, `--post_name=${slug}`, `--post_status=${page.status}`, `--post_content=${page.content}`);
    if (page.template) command.push(`--page_template=${page.template}`);
    await runWp(site, command, { timeout: 180_000 });
  }
}

async function applyWordPressBlueprint(site) {
  if (!site.blueprintId || site.blueprintAppliedAt) return;
  const state = await readState();
  const blueprint = state.blueprints[site.blueprintId];
  if (!blueprint) throw new Error('The selected WordPress blueprint is no longer available.');
  await setSiteState(site.id, { phase: `Applying ${blueprint.name} blueprint` });
  const staging = `/var/www/html/wp-content/.geekheros-blueprint-${blueprint.id}`;
  await docker(['exec', site.wpContainer, 'mkdir', '-p', staging], { timeout: 30_000 });
  try {
    const orderedFiles = [...(blueprint.files || [])].sort((left, right) => {
      const order = { plugin: 0, theme: 1, 'mu-plugin': 2, 'wp-content': 3, settings: 4, content: 5 };
      return (order[left.kind] ?? 99) - (order[right.kind] ?? 99);
    });
    const applyFile = async (file) => {
      if (path.basename(String(file.storageName || '')) !== file.storageName) throw new Error(`Blueprint file metadata is invalid for ${file.name}.`);
      const source = path.join(blueprintRoot, blueprint.id, file.storageName);
      const contents = await readFile(source);
      if (createHash('sha256').update(contents).digest('hex') !== file.sha256) throw new Error(`Blueprint file ${file.name} failed its integrity check.`);
      if (file.kind === 'settings') {
        await applyBlueprintSettings(site, JSON.parse(contents.toString('utf8')));
        return;
      }
      if (file.kind === 'mu-plugin') {
        const destination = `/var/www/html/wp-content/mu-plugins/${cleanBlueprintFileName(file.name)}`;
        await docker(['exec', site.wpContainer, 'mkdir', '-p', path.posix.dirname(destination)], { timeout: 30_000 });
        await docker(['cp', source, `${site.wpContainer}:${destination}`], { timeout: 120_000 });
        await docker(['exec', site.wpContainer, 'chmod', '0644', destination], { timeout: 30_000 });
        return;
      }
      if (file.kind === 'wp-content') {
        const relative = cleanBlueprintDestination(file.destination, file.name);
        const destination = `/var/www/html/${relative}`;
        await docker(['exec', site.wpContainer, 'mkdir', '-p', path.posix.dirname(destination)], { timeout: 30_000 });
        await docker(['cp', source, `${site.wpContainer}:${destination}`], { timeout: 120_000 });
        return;
      }
      const stagedFile = `${staging}/${file.id}${path.extname(file.name).toLowerCase()}`;
      await docker(['cp', source, `${site.wpContainer}:${stagedFile}`], { timeout: 120_000 });
      if (file.kind === 'plugin') await installBlueprintArchive(site, 'plugin', stagedFile, file.name);
      else if (file.kind === 'theme') await installBlueprintArchive(site, 'theme', stagedFile, file.name);
      else if (file.kind === 'content') {
        await installBlueprintSlug(site, 'plugin', { slug: 'wordpress-importer', activate: true });
        await runWp(site, ['import', stagedFile, '--authors=create'], { timeout: 600_000 });
      } else throw new Error(`Blueprint file ${file.name} has an unsupported purpose.`);
    };

    for (const file of orderedFiles.filter((entry) => entry.kind === 'plugin' || entry.kind === 'theme')) await applyFile(file);
    for (const plugin of blueprint.plugins || []) await installBlueprintSlug(site, 'plugin', plugin);
    for (const theme of blueprint.themes || []) await installBlueprintSlug(site, 'theme', theme);
    for (const file of orderedFiles.filter((entry) => entry.kind !== 'plugin' && entry.kind !== 'theme')) await applyFile(file);
    await runWp(site, ['rewrite', 'flush', '--hard'], { timeout: 120_000 });
    await setSiteState(site.id, { blueprintAppliedAt: new Date().toISOString() });
  } finally {
    await docker(['exec', site.wpContainer, 'rm', '-rf', staging], { timeout: 30_000 }).catch(() => undefined);
  }
}

async function ensureDatabaseContainer(site) {
  if (await inspectContainer(site.dbContainer)) return;
  await docker([
    'run', '-d', '--name', site.dbContainer, '--restart', 'unless-stopped',
    '--network', site.network, '--network-alias', 'db',
    '--label', managedLabel, '--label', 'com.geekheros.role=database', '--label', `com.geekheros.site.id=${site.id}`,
    '-e', 'MARIADB_DATABASE=wordpress', '-e', 'MARIADB_USER=wordpress',
    '-e', `MARIADB_PASSWORD=${site.secrets.dbPassword}`, '-e', `MARIADB_ROOT_PASSWORD=${site.secrets.dbRootPassword}`,
    '-v', `${site.dbVolume}:/var/lib/mysql`,
    '--health-cmd', 'healthcheck.sh --connect --innodb_initialized', '--health-interval', '5s', '--health-timeout', '5s', '--health-retries', '30',
    databaseImage,
  ], { timeout: 600_000 });
}

async function ensureWordPressContainer(site) {
  if (await inspectContainer(site.wpContainer)) return;
  const router = `gh-${site.id.replace(/[^a-z0-9]/g, '').slice(0, 12)}`;
  await docker([
    'run', '-d', '--name', site.wpContainer, '--restart', 'unless-stopped',
    '--network', site.network,
    ...limitsForPod(site.pod),
    '-p', '127.0.0.1::80',
    '--label', managedLabel, '--label', 'com.geekheros.role=wordpress',
    '--label', `com.geekheros.site.id=${site.id}`, '--label', `com.geekheros.site.name=${site.name}`,
    '--label', `com.geekheros.site.domain=${site.domain}`, '--label', `com.geekheros.site.pod=${site.pod}`,
    '--label', 'traefik.enable=true',
    '--label', `traefik.http.routers.${router}.rule=Host(\`${site.domain}\`)`,
    '--label', `traefik.http.routers.${router}.entrypoints=web`,
    '--label', `traefik.http.services.${router}.loadbalancer.server.port=80`,
    '--label', `traefik.docker.network=${edgeNetwork}`,
    '-e', 'WORDPRESS_DB_HOST=db:3306', '-e', 'WORDPRESS_DB_NAME=wordpress', '-e', 'WORDPRESS_DB_USER=wordpress',
    '-e', `WORDPRESS_DB_PASSWORD=${site.secrets.dbPassword}`,
    '-e', `WORDPRESS_CONFIG_EXTRA=${localPreviewConfig} define('FS_METHOD', 'direct'); define('DISALLOW_FILE_EDIT', true);`,
    '-v', `${site.wpVolume}:/var/www/html`,
    wordpressImage,
  ], { timeout: 600_000 });
  await docker(['network', 'connect', edgeNetwork, site.wpContainer]);
}

async function ensureLocalPreviewConfig(site) {
  const encodedBlock = Buffer.from(`\n${localPreviewConfig}\n`, 'utf8').toString('base64');
  const php = [
    '$path="/var/www/html/wp-config.php";',
    `$marker="${localPreviewConfigMarker}";`,
    `$block=base64_decode("${encodedBlock}");`,
    '$config=file_get_contents($path);',
    'if ($config === false) { fwrite(STDERR, "Unable to read wp-config.php.\\n"); exit(1); }',
    'if (strpos($config, $marker) !== false) { exit(0); }',
    "$position=strpos($config, \"/* That's all, stop editing!\");",
    'if ($position === false) { $position=strpos($config, "require_once ABSPATH"); }',
    'if ($position === false) { fwrite(STDERR, "Unable to locate the wp-config.php insertion point.\\n"); exit(1); }',
    '$updated=substr($config, 0, $position).$block.substr($config, $position);',
    'if (file_put_contents($path, $updated) === false) { fwrite(STDERR, "Unable to update wp-config.php.\\n"); exit(1); }',
  ].join('');
  await docker(['exec', site.wpContainer, 'php', '-r', php], { timeout: 30_000 });
}

async function ensureControlPlaneMuPlugin(site) {
  const encodedPlugin = Buffer.from(controlPlaneMuPlugin, 'utf8').toString('base64');
  const php = [
    '$directory="/var/www/html/wp-content/mu-plugins";',
    '$path=$directory."/geekheros-control-plane.php";',
    `$contents=base64_decode("${encodedPlugin}");`,
    'if (!is_dir($directory) && !mkdir($directory, 0755, true)) { fwrite(STDERR, "Unable to create the MU-plugin directory.\\n"); exit(1); }',
    '$current=is_file($path) ? file_get_contents($path) : false;',
    'if ($current !== $contents && file_put_contents($path, $contents, LOCK_EX) === false) { fwrite(STDERR, "Unable to install the GeekHeros MU-plugin.\\n"); exit(1); }',
    'chmod($path, 0644);',
  ].join('');
  await docker(['exec', site.wpContainer, 'php', '-r', php], { timeout: 30_000 });
}

async function getDirectPort(container) {
  try {
    const { stdout } = await docker(['port', container, '80/tcp'], { timeout: 20_000 });
    const match = stdout.match(/127\.0\.0\.1:(\d+)/) || stdout.match(/:(\d+)$/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function lovableSourceDirectory(site) {
  return path.join(sourceRoot, site.id);
}

async function replaceDirectory(incomingDirectory, destinationDirectory) {
  await rm(destinationDirectory, { recursive: true, force: true });
  let lastError;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      await rename(incomingDirectory, destinationDirectory);
      return;
    } catch (error) {
      lastError = error;
      if (!stateReplaceRetryCodes.has(error?.code) || attempt === 6) break;
      await new Promise((resolve) => setTimeout(resolve, 25 * (2 ** attempt)));
    }
  }
  if (process.platform === 'win32' && stateReplaceRetryCodes.has(lastError?.code)) {
    await mkdir(destinationDirectory, { recursive: true });
    await cp(incomingDirectory, destinationDirectory, { recursive: true, force: true });
    await rm(incomingDirectory, { recursive: true, force: true });
    return;
  }
  throw lastError;
}

function lovableProjectPrompt(site) {
  const sections = [site.lovablePrompt];
  const images = Array.isArray(site.lovableReferences?.images) ? site.lovableReferences.images : [];
  const pages = Array.isArray(site.lovableReferences?.html) ? site.lovableReferences.html : [];
  if (images.length) sections.push(`Reference images:\n${images.map((url) => `- ${url}`).join('\n')}`);
  if (pages.length) sections.push(`Reference pages:\n${pages.map((url) => `- ${url}`).join('\n')}`);
  return sections.filter(Boolean).join('\n\n');
}

function normalizeLovableSourcePath(value) {
  const raw = String(value || '').trim().replaceAll('\\', '/');
  if (!raw || raw.endsWith('/')) return null;
  const normalized = path.posix.normalize(raw).replace(/^\.\//, '');
  const parts = normalized.split('/');
  if (!normalized || normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized) || parts.includes('..')) {
    throw new Error('Lovable returned an unsafe project file path.');
  }
  if (parts[0] === '.git' || parts[0] === 'node_modules') return null;
  return normalized;
}

function lovableFileEntries(payload) {
  const source = Array.isArray(payload?.files)
    ? payload.files
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  return source.flatMap((entry) => {
    const type = typeof entry === 'object' && entry ? String(entry.type || entry.kind || '').toLowerCase() : '';
    if (['directory', 'dir', 'tree', 'folder'].includes(type)) return [];
    const filePath = normalizeLovableSourcePath(typeof entry === 'string' ? entry : entry?.path || entry?.file_path || entry?.filePath || entry?.name);
    return filePath ? [filePath] : [];
  });
}

function lovableNextCursor(payload) {
  return String(payload?.pagination?.next_cursor || payload?.pagination?.nextCursor || payload?.next_cursor || payload?.nextCursor || '');
}

function lovableFileBuffer(result) {
  const structured = result?.structuredContent && typeof result.structuredContent === 'object' ? result.structuredContent : null;
  const encoded = structured ? deepValue(structured, ['content_base64', 'contentBase64', 'base64_content', 'base64Content']) : null;
  if (typeof encoded === 'string' && encoded) return Buffer.from(encoded, 'base64');
  const structuredContents = structured ? deepValue(structured, ['content', 'file_content', 'fileContent', 'text']) : null;
  if (typeof structuredContents === 'string') {
    const encoding = String(deepValue(structured, ['encoding']) || '').toLowerCase();
    return Buffer.from(structuredContents, encoding === 'base64' ? 'base64' : 'utf8');
  }

  const text = lovableToolText(result);
  try {
    const parsed = JSON.parse(text);
    const wrappedContents = deepValue(parsed, ['content', 'file_content', 'fileContent']);
    if (typeof wrappedContents === 'string') {
      const encoding = String(deepValue(parsed, ['encoding']) || '').toLowerCase();
      return Buffer.from(wrappedContents, encoding === 'base64' ? 'base64' : 'utf8');
    }
  } catch {}
  return Buffer.from(text, 'utf8');
}

async function lovableProjectSnapshot(client, projectId) {
  const details = lovableToolPayload(await client.callTool({ name: 'get_project', arguments: { project_id: projectId } }));
  let revision = String(deepValue(details, ['latest_commit_sha', 'latestCommitSha', 'commit_sha', 'commitSha']) || '');
  if (!revision) {
    try {
      const edits = lovableToolPayload(await client.callTool({ name: 'list_edits', arguments: { project_id: projectId, limit: 1 } }));
      revision = String(deepValue(edits, ['commit_sha', 'commitSha', 'sha']) || '');
    } catch {}
  }
  return {
    revision,
    status: String(deepValue(details, ['status', 'build_status', 'buildStatus']) || '').toLowerCase(),
    editorUrl: String(deepValue(details, ['editor_url', 'editorUrl']) || ''),
    previewUrl: String(deepValue(details, ['preview_url', 'previewUrl']) || ''),
  };
}

async function ensureLovableProject(site) {
  if (site.lovableProjectId) return { id: site.lovableProjectId };
  let workspaceId = site.lovableWorkspaceId || '';
  if (!workspaceId) {
    const integration = lovableIntegration(await readState());
    const workspaces = Array.isArray(integration.profile?.workspaces) ? integration.profile.workspaces : [];
    if (workspaces.length === 1 || (!site.sourceProvider && workspaces.length)) workspaceId = workspaces[0].id;
  }
  await setSiteState(site.id, { phase: 'Creating project in Lovable' });
  const project = await createLovableProject({ initialMessage: lovableProjectPrompt(site), workspaceId, wait: false });
  await setSiteState(site.id, {
    lovableProjectId: project.id,
    lovableWorkspaceId: workspaceId || null,
    lovableBuildUrl: project.editorUrl || site.lovableBuildUrl,
    lovablePreviewUrl: project.previewUrl || null,
    sourceProvider: 'lovable',
  });
  return project;
}

async function materializeLovableProjectSource(site) {
  const project = await ensureLovableProject(site);
  const sourceDirectory = lovableSourceDirectory(site);
  const incomingDirectory = `${sourceDirectory}.incoming-${randomBytes(5).toString('hex')}`;
  await setSiteState(site.id, { phase: 'Downloading Lovable source' });
  await mkdir(incomingDirectory, { recursive: true });
  try {
    const result = await withLovableClient(async (client) => {
      const startedAt = Date.now();
      let snapshot;
      let entries = [];
      do {
        snapshot = await lovableProjectSnapshot(client, project.id);
        const failed = ['error', 'failed', 'cancelled', 'canceled'].includes(snapshot.status);
        const generating = ['pending', 'queued', 'creating', 'generating', 'building', 'processing', 'running', 'in_progress', 'in-progress'].includes(snapshot.status);
        if (failed) throw new Error('Lovable could not finish generating the project. Open the project in Lovable for details, then retry.');
        const seen = new Set();
        let cursor = '';
        let listError = null;
        try {
          for (let page = 0; page < 25; page += 1) {
            const payload = lovableToolPayload(await client.callTool({
              name: 'list_files',
              arguments: { project_id: project.id, limit: 100, ...(snapshot.revision ? { ref: snapshot.revision } : {}), ...(cursor ? { cursor } : {}) },
            }));
            for (const filePath of lovableFileEntries(payload)) seen.add(filePath);
            const nextCursor = lovableNextCursor(payload);
            if (!nextCursor || nextCursor === cursor) break;
            cursor = nextCursor;
          }
        } catch (error) {
          listError = error;
        }
        entries = [...seen].sort((left, right) => left.localeCompare(right));
        if (entries.length && !generating) break;
        if (Date.now() - startedAt >= 600_000) {
          const detail = listError?.message ? ` Lovable last reported: ${listError.message}` : '';
          throw new Error(`Lovable did not finish generating source files within 10 minutes. Open the project in Lovable, then retry the deployment.${detail}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      } while (true);

      if (entries.length > 2_500) throw new Error('The Lovable project contains too many files to import safely.');
      const digest = createHash('sha256');
      let totalBytes = 0;
      for (let offset = 0; offset < entries.length; offset += 6) {
        const batch = entries.slice(offset, offset + 6);
        const files = await Promise.all(batch.map(async (filePath) => {
          const response = await client.callTool({
            name: 'read_file',
            arguments: { project_id: project.id, path: filePath, ...(snapshot.revision ? { ref: snapshot.revision } : {}) },
          });
          const contents = lovableFileBuffer(response);
          if (contents.length > 10 * 1024 * 1024) throw new Error(`The Lovable source file "${filePath}" is too large to import safely.`);
          return { filePath, contents };
        }));
        for (const file of files) {
          totalBytes += file.contents.length;
          if (totalBytes > 100 * 1024 * 1024) throw new Error('The Lovable project source is larger than the 100 MB import limit.');
          const destination = path.join(incomingDirectory, ...file.filePath.split('/'));
          await mkdir(path.dirname(destination), { recursive: true });
          await writeFile(destination, file.contents);
          digest.update(file.filePath).update('\0').update(file.contents).update('\0');
        }
      }
      return { snapshot, revision: snapshot.revision || digest.digest('hex') };
    });

    await replaceDirectory(incomingDirectory, sourceDirectory);
    await setSiteState(site.id, {
      sourceProvider: 'lovable',
      lovableBuildUrl: result.snapshot.editorUrl || site.lovableBuildUrl,
      lovablePreviewUrl: result.snapshot.previewUrl || null,
      repositoryBranch: null,
    });
    return { sourceDirectory, revision: result.revision };
  } catch (error) {
    await rm(incomingDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

function lovableRepositoryArgs(site) {
  const args = [];
  const repositoryToken = site.secrets?.repositoryToken || '';
  if (repositoryToken) args.push('-c', `http.extraHeader=Authorization: Bearer ${repositoryToken}`);
  return { args, repositoryToken };
}

async function inspectLovableRepository(site) {
  const { args, repositoryToken } = lovableRepositoryArgs(site);
  args.push('ls-remote', '--symref', site.repositoryUrl, 'HEAD', 'refs/heads/*');
  const result = await git(args, { secret: repositoryToken, timeout: 120_000 });
  return parseRemoteReferences(result.stdout);
}

async function resolveLovableRepositoryBranch(site) {
  const references = await inspectLovableRepository(site);
  const repositoryBranch = selectRemoteBranch(references, site.repositoryBranch);
  if (repositoryBranch !== site.repositoryBranch || site.sourceProvider !== 'git') await setSiteState(site.id, { repositoryBranch, sourceProvider: 'git' });
  return { repositoryBranch, references };
}

async function prepareLovableSource(site) {
  await mkdir(sourceRoot, { recursive: true });
  let sourceDirectory;
  let revision;
  const directLovableSource = site.sourceProvider === 'lovable' || !site.repositoryUrl;
  if (directLovableSource) {
    ({ sourceDirectory, revision } = await materializeLovableProjectSource(site));
  } else {
    const references = await inspectLovableRepository(site);
    if (!site.sourceProvider && references.branches.size === 0) {
      ({ sourceDirectory, revision } = await materializeLovableProjectSource(site));
    } else {
      const repositoryBranch = selectRemoteBranch(references, site.repositoryBranch);
      sourceDirectory = lovableSourceDirectory(site);
      const incomingDirectory = `${sourceDirectory}.incoming-${randomBytes(5).toString('hex')}`;
      const { args: cloneArgs, repositoryToken } = lovableRepositoryArgs(site);
      cloneArgs.push('clone', '--depth', '1', '--branch', repositoryBranch, '--single-branch', site.repositoryUrl, incomingDirectory);
      try {
        await git(cloneArgs, { secret: repositoryToken, timeout: 600_000 });
        revision = (await git(['-C', incomingDirectory, 'rev-parse', 'HEAD'], { timeout: 30_000 })).stdout;
        await replaceDirectory(incomingDirectory, sourceDirectory);
        await setSiteState(site.id, { repositoryBranch, sourceProvider: 'git' });
      } catch (error) {
        await rm(incomingDirectory, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    }
  }

  let packageDefinition;
  try { packageDefinition = JSON.parse(await readFile(path.join(sourceDirectory, 'package.json'), 'utf8')); } catch {
    throw new Error('The Lovable repository does not contain a valid package.json file.');
  }
  if (!packageDefinition?.scripts?.build) throw new Error('The Lovable repository does not define an npm build script.');

  const buildKeys = Object.keys(site.buildEnvironment || {});
  const environmentLines = buildKeys.flatMap((key) => [`ARG ${key}`, `ENV ${key}=\${${key}}`]);
  const packageDependencies = { ...(packageDefinition.dependencies || {}), ...(packageDefinition.devDependencies || {}) };
  const usesTanStackStart = Boolean(packageDependencies['@tanstack/react-start']);
  const buildEnvironmentLines = usesTanStackStart ? ['ENV NITRO_PRESET=node-server'] : [];
  const buildStage = [
    'FROM node:22-alpine AS build',
    'WORKDIR /app',
    'COPY package*.json ./',
    'RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi',
    'COPY . .',
    ...environmentLines,
    ...buildEnvironmentLines,
    'RUN npm run build',
    '',
  ];
  const runtimeStage = usesTanStackStart
    ? [
      'FROM node:22-alpine',
      'WORKDIR /app',
      'COPY --from=build /app/.output ./.output',
      'ENV NODE_ENV=production',
      'ENV HOST=0.0.0.0',
      'ENV PORT=80',
      'EXPOSE 80',
      'HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1',
      'CMD ["node", ".output/server/index.mjs"]',
      '',
    ]
    : [
      'FROM nginx:1.27-alpine',
      'COPY --from=build /app/dist /usr/share/nginx/html',
      'COPY .geekheros-nginx.conf /etc/nginx/conf.d/default.conf',
      'EXPOSE 80',
      'HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1',
      '',
    ];
  const dockerfile = [...buildStage, ...runtimeStage].join('\n');
  const nginx = [
    'server {',
    '  listen 80;',
    '  server_name _;',
    '  root /usr/share/nginx/html;',
    '  index index.html;',
    '  location / { try_files $uri $uri/ /index.html; }',
    '  location ~* \\.(?:css|js|jpg|jpeg|gif|png|webp|ico|svg|woff2?)$ { expires 7d; add_header Cache-Control "public, immutable"; try_files $uri =404; }',
    '}',
    '',
  ].join('\n');
  await writeFile(path.join(sourceDirectory, '.geekheros.Dockerfile'), dockerfile, 'utf8');
  await writeFile(path.join(sourceDirectory, '.geekheros.Dockerfile.dockerignore'), ['.git', 'node_modules', 'dist', '.output', '.env*', '*.log', ''].join('\n'), 'utf8');
  await writeFile(path.join(sourceDirectory, '.geekheros-nginx.conf'), nginx, 'utf8');
  return { sourceDirectory, revision };
}

async function buildLovableImage(site) {
  const { sourceDirectory, revision } = await prepareLovableSource(site);
  const args = ['build', '--pull', '-f', path.join(sourceDirectory, '.geekheros.Dockerfile'), '-t', site.image];
  for (const [key, value] of Object.entries(site.buildEnvironment || {})) args.push('--build-arg', `${key}=${value}`);
  args.push(sourceDirectory);
  await docker(args, { timeout: 1_200_000, maxBuffer: 32 * 1024 * 1024 });
  return revision;
}

async function ensureLovableContainer(site, recreate = false) {
  const existing = await inspectContainer(site.wpContainer);
  if (existing && recreate) await docker(['rm', '-f', site.wpContainer]);
  else if (existing) return;
  const router = `gh-${site.id.replace(/[^a-z0-9]/g, '').slice(0, 12)}`;
  await docker([
    'run', '-d', '--name', site.wpContainer, '--restart', 'unless-stopped',
    '--network', site.network,
    ...limitsForPod(site.pod),
    '-p', '127.0.0.1::80',
    '--label', managedLabel, '--label', 'com.geekheros.role=lovable',
    '--label', `com.geekheros.site.id=${site.id}`, '--label', `com.geekheros.site.name=${site.name}`,
    '--label', `com.geekheros.site.domain=${site.domain}`, '--label', `com.geekheros.site.pod=${site.pod}`,
    '--label', 'traefik.enable=true',
    '--label', `traefik.http.routers.${router}.rule=Host(\`${site.domain}\`)`,
    '--label', `traefik.http.routers.${router}.entrypoints=web`,
    '--label', `traefik.http.services.${router}.loadbalancer.server.port=80`,
    '--label', `traefik.docker.network=${edgeNetwork}`,
    site.image,
  ], { timeout: 600_000 });
  await docker(['network', 'connect', edgeNetwork, site.wpContainer]);
}

async function deployLovableSite(site, recreate = false) {
  await setSiteState(site.id, { phase: 'Preparing Lovable source', error: null });
  const revision = await buildLovableImage(site);
  await setSiteState(site.id, { phase: 'Starting Lovable build' });
  await ensureLovableContainer(site, recreate);
  const directPort = await getDirectPort(site.wpContainer);
  await setSiteState(site.id, {
    phase: null, status: 'Running', error: null, directPort, sourceRevision: revision,
    lastScannedAt: new Date().toISOString(), updates: 0,
  });
  return { directPort, revision };
}

async function refreshLovableSourceStatus(site) {
  if (site.sourceProvider === 'lovable' || site.lovableProjectId) {
    if (!site.lovableProjectId) throw new Error('Deploy this site once to create its Lovable project before checking for source changes.');
    const snapshot = await withLovableClient((client) => lovableProjectSnapshot(client, site.lovableProjectId));
    const remoteRevision = snapshot.revision || null;
    if (!remoteRevision) throw new Error('Lovable has not produced the project’s first source revision yet.');
    const updates = site.sourceRevision && site.sourceRevision !== remoteRevision ? 1 : 0;
    await setSiteState(site.id, {
      sourceProvider: 'lovable', remoteRevision, updates, lastScannedAt: new Date().toISOString(),
      lovableBuildUrl: snapshot.editorUrl || site.lovableBuildUrl,
      lovablePreviewUrl: snapshot.previewUrl || site.lovablePreviewUrl || null,
    });
    return { remoteRevision, updates };
  }
  const { repositoryBranch, references } = await resolveLovableRepositoryBranch(site);
  const remoteRevision = references.branches.get(repositoryBranch) || null;
  if (!remoteRevision) throw new Error(`The configured Lovable repository branch "${repositoryBranch}" could not be found.`);
  const updates = site.sourceRevision && site.sourceRevision !== remoteRevision ? 1 : 0;
  await setSiteState(site.id, { repositoryBranch, remoteRevision, updates, lastScannedAt: new Date().toISOString() });
  return { remoteRevision, updates };
}

function parseJsonOutput(stdout, fallback = []) {
  if (!stdout) return fallback;
  try { return JSON.parse(stdout); } catch { return fallback; }
}

async function readInventory(site) {
  const inspect = await inspectContainer(site.wpContainer);
  if (!inspect?.State?.Running) throw Object.assign(new Error('Start the WordPress container before reading its inventory.'), { status: 409 });

  const [coreVersion, pluginsResult, themesResult] = await Promise.all([
    runWp(site, ['core', 'version'], { timeout: 60_000 }),
    runWp(site, ['plugin', 'list', '--format=json'], { timeout: 120_000 }),
    runWp(site, ['theme', 'list', '--format=json'], { timeout: 120_000 }),
  ]);
  let coreUpdates = [];
  try { coreUpdates = parseJsonOutput((await runWp(site, ['core', 'check-update', '--format=json'], { timeout: 120_000 })).stdout, []); } catch {}

  const normalizePackage = (item) => ({
    name: String(item.name || ''),
    status: String(item.status || 'inactive'),
    version: String(item.version || '—'),
    update: String(item.update || 'none'),
    updateVersion: item.update_version ? String(item.update_version) : null,
    autoUpdate: String(item.auto_update || 'off'),
  });
  const plugins = parseJsonOutput(pluginsResult.stdout, []).map(normalizePackage);
  const themes = parseJsonOutput(themesResult.stdout, []).map(normalizePackage);
  const coreUpdate = Array.isArray(coreUpdates) && coreUpdates.length ? {
    version: String(coreUpdates[0].version || ''),
    updateType: String(coreUpdates[0].update_type || ''),
    packageUrl: coreUpdates[0].package_url ? String(coreUpdates[0].package_url) : null,
  } : null;
  return {
    readAt: new Date().toISOString(),
    core: { version: coreVersion.stdout || site.wpVersion || '—', update: coreUpdate },
    plugins,
    themes,
    updates: {
      core: coreUpdate ? 1 : 0,
      plugins: plugins.filter((item) => item.update === 'available').length,
      themes: themes.filter((item) => item.update === 'available').length,
    },
    backups: Array.isArray(site.backups) ? site.backups : [],
  };
}

async function refreshVersions(site) {
  let wpVersion = site.wpVersion || '—';
  let phpVersion = site.phpVersion || '—';
  let updates = Number(site.updates || 0);
  try { phpVersion = (await docker(['exec', site.wpContainer, 'php', '-r', 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;'], { timeout: 30_000 })).stdout || phpVersion; } catch {}
  try {
    const inventory = await readInventory(site);
    wpVersion = inventory.core.version || wpVersion;
    updates = inventory.updates.core + inventory.updates.plugins + inventory.updates.themes;
    await setSiteState(site.id, { updateCounts: inventory.updates });
  } catch {}
  await setSiteState(site.id, { wpVersion, phpVersion, updates, lastScannedAt: new Date().toISOString() });
}

async function provisionSite(siteId) {
  const state = await readState();
  const site = state.sites[siteId];
  if (!site) return;
  try {
    if (site.kind === 'lovable') {
      await setSiteState(siteId, { phase: 'Preparing build environment', error: null });
      await ensureEdge();
      await ensureNetwork(site.network, [managedLabel, `com.geekheros.site.id=${site.id}`]);
      await deployLovableSite(site);
      await recordActivity({ siteId, siteName: site.name, type: 'provision', message: `${site.name} launched from Lovable source in Docker Desktop.` });
      return;
    }
    await setSiteState(siteId, { phase: 'Pulling images', error: null });
    await ensureEdge();
    await ensureNetwork(site.network, [managedLabel, `com.geekheros.site.id=${site.id}`]);
    await ensureVolume(site.dbVolume, site.id);
    await ensureVolume(site.wpVolume, site.id);
    await ensureDatabaseContainer(site);
    await setSiteState(siteId, { phase: 'Starting database' });
    await waitForDatabase(site);
    await ensureWordPressContainer(site);
    const directPort = await getDirectPort(site.wpContainer);
    await setSiteState(siteId, { phase: 'Installing WordPress', directPort });
    await waitForWordPressFiles(site);
    await ensureLocalPreviewConfig(site);
    await ensureControlPlaneMuPlugin(site);

    let installed = false;
    try { await runWp(site, ['core', 'is-installed'], { timeout: 60_000 }); installed = true; } catch {}
    if (!installed) {
      await runWp(site, [
        'core', 'install', `--url=http://${site.domain}`, `--title=${site.name}`,
        `--admin_user=${site.adminUser}`, `--admin_password=${site.adminPassword}`,
        `--admin_email=${site.adminEmail}`, '--skip-email',
      ], { timeout: 300_000 });
      await runWp(site, ['rewrite', 'structure', '/%postname%/', '--hard'], { timeout: 90_000 });
    }

    await applyWordPressBlueprint(site);

    await setSiteState(siteId, { phase: null, status: 'Running', error: null, directPort, adminPassword: undefined });
    await refreshVersions({ ...site, directPort });
    await recordActivity({ siteId, siteName: site.name, type: 'provision', message: `${site.name} launched in Docker Desktop.` });
  } catch (error) {
    await setSiteState(siteId, { phase: null, status: 'Error', error: error.message || 'Provisioning failed.' });
    await recordActivity({ siteId, siteName: site.name, type: 'provision', state: 'failed', message: error.message || 'Provisioning failed.' });
  }
}

async function createSite(input) {
  let values;
  try { values = validateSiteInput(input); } catch (error) { throw Object.assign(error, { status: Number(error?.status) || 400 }); }
  const state = await readState();
  if (Object.values(state.sites).some((site) => site.domain === values.domain)) throw new Error('That domain is already managed by GeekHeros.');
  if (values.kind === 'lovable' && values.sourceProvider === 'lovable') {
    const integration = lovableIntegration(state);
    if (!integration.tokens) throw Object.assign(new Error('Connect Lovable in Settings before launching directly from Lovable.'), { status: 409 });
    const workspaces = Array.isArray(integration.profile?.workspaces) ? integration.profile.workspaces : [];
    if (!values.lovableProjectId && !workspaces.length) {
      throw Object.assign(new Error('The connected Lovable account does not expose a workspace where GeekHeros can create this project.'), { status: 409 });
    }
    if (!values.lovableProjectId && !values.lovableWorkspaceId && workspaces.length === 1) values.lovableWorkspaceId = workspaces[0].id;
    if (!values.lovableProjectId && !values.lovableWorkspaceId && workspaces.length > 1) {
      throw Object.assign(new Error('Choose the Lovable workspace where GeekHeros should create this project.'), { status: 400 });
    }
    if (values.lovableWorkspaceId && !workspaces.some((workspace) => workspace.id === values.lovableWorkspaceId)) {
      throw Object.assign(new Error('The selected Lovable workspace is no longer available. Refresh the connection and choose another workspace.'), { status: 400 });
    }
  }
  const blueprint = values.kind === 'wordpress' && values.blueprintId ? state.blueprints[values.blueprintId] : null;
  if (values.kind === 'wordpress' && values.blueprintId && !blueprint) throw Object.assign(new Error('The selected WordPress blueprint no longer exists.'), { status: 400 });
  const clientId = input.clientId ? String(input.clientId) : null;
  if (clientId && !state.clients[clientId]) throw new Error('The selected client no longer exists.');
  const id = `site_${randomBytes(6).toString('hex')}`;
  const namespace = `gh-${slugify(values.domain)}-${id.slice(-4)}`;
  const repositoryToken = values.kind === 'lovable' ? values.repositoryToken : '';
  const publicValues = { ...values };
  delete publicValues.repositoryToken;
  const isLovable = values.kind === 'lovable';
  const site = {
    id, ...publicValues, namespace, clientId, tags: validateTags(input.tags), blueprintName: blueprint?.name || null,
    network: `${namespace}-net`, dbContainer: isLovable ? null : `${namespace}-db`, wpContainer: `${namespace}-${isLovable ? 'app' : 'wp'}`,
    dbVolume: isLovable ? null : `${namespace}-db`, wpVolume: isLovable ? null : `${namespace}-wp`,
    image: isLovable ? `geekheros/lovable-${id.slice(-12)}:latest` : wordpressImage,
    status: 'Provisioning', phase: 'Queued', error: null,
    wpVersion: isLovable ? 'Lovable' : '—', phpVersion: isLovable ? 'Node 22' : '—', updates: 0, backups: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    secrets: isLovable
      ? { repositoryToken }
      : { dbPassword: randomBytes(24).toString('base64url'), dbRootPassword: randomBytes(32).toString('base64url') },
  };
  await updateState((next) => { next.sites[id] = site; });
  void provisionSite(id);
  return publicSite(site, null);
}

function durationSince(iso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function publicSite(site, inspect) {
  const dockerStatus = inspect?.State?.Status;
  const inspectedPort = Number(inspect?.NetworkSettings?.Ports?.['80/tcp']?.[0]?.HostPort);
  const directPort = Number.isInteger(inspectedPort) && inspectedPort > 0 ? inspectedPort : site.directPort;
  const status = site.phase ? 'Provisioning' : site.status === 'Error' ? 'Error' : dockerStatus === 'running' ? 'Running' : dockerStatus === 'exited' || dockerStatus === 'created' ? 'Stopped' : dockerStatus ? 'Attention' : site.status || 'Unknown';
  return {
    id: site.id, name: site.name, domain: site.domain, status, phase: site.phase || null, error: site.error || null,
    kind: site.kind === 'lovable' ? 'lovable' : 'wordpress',
    clientId: site.clientId || null, tags: Array.isArray(site.tags) ? site.tags : [],
    blueprintId: site.kind === 'wordpress' ? site.blueprintId || null : null,
    blueprintName: site.kind === 'wordpress' ? site.blueprintName || null : null,
    blueprintAppliedAt: site.kind === 'wordpress' ? site.blueprintAppliedAt || null : null,
    region: 'Local Docker', pod: site.pod, wp: site.wpVersion || '—', php: site.phpVersion || '—',
    updates: Number(site.updates || 0), uptime: status === 'Running' ? durationSince(inspect?.State?.StartedAt || site.createdAt) : '—',
    createdAt: site.createdAt, updatedAt: site.updatedAt, containerId: inspect?.Id?.slice(0, 12) || null,
    containerName: site.wpContainer, databaseContainer: site.dbContainer || 'Not required', image: site.image,
    directUrl: directPort ? `http://127.0.0.1:${directPort}` : null,
    siteUrl: `http://${site.domain}`, adminUrl: site.kind === 'lovable' ? null : `http://${site.domain}/wp-admin/`,
    backupCount: site.backups?.length || 0, backups: Array.isArray(site.backups) ? site.backups : [],
    lastBackupAt: site.backups?.[0]?.createdAt || null,
    lastScannedAt: site.lastScannedAt || null, updateCounts: site.updateCounts || { core: 0, plugins: 0, themes: 0 },
    repositoryUrl: site.kind === 'lovable' ? site.repositoryUrl : null,
    repositoryBranch: site.kind === 'lovable' ? site.repositoryBranch : null,
    sourceProvider: site.kind === 'lovable' ? site.sourceProvider || (site.lovableProjectId ? 'lovable' : 'git') : null,
    sourceRevision: site.kind === 'lovable' ? site.sourceRevision || null : null,
    lovableProjectId: site.kind === 'lovable' ? site.lovableProjectId || null : null,
    lovableWorkspaceId: site.kind === 'lovable' ? site.lovableWorkspaceId || null : null,
    lovableBuildUrl: site.kind === 'lovable' ? site.lovableBuildUrl : null,
    screenshot: site.screenshot ? { capturedAt: site.screenshot.capturedAt, width: site.screenshot.width, height: site.screenshot.height } : null,
    monitoring: monitoringSummary(site),
  };
}

function monitoringSummary(site) {
  const checks = Array.isArray(site.monitoring?.checks) ? site.monitoring.checks : [];
  const successful = checks.filter((check) => check.ok);
  const latencyValues = successful.map((check) => Number(check.latencyMs)).filter(Number.isFinite);
  return {
    lastCheck: checks[0] || null,
    uptimePercent: checks.length ? Number(((successful.length / checks.length) * 100).toFixed(2)) : null,
    averageLatencyMs: latencyValues.length ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length) : null,
    checkCount: checks.length,
  };
}

async function listSites() {
  const state = await readState();
  const sites = await Promise.all(Object.values(state.sites).map(async (site) => publicSite(site, await inspectContainer(site.wpContainer))));
  return sites.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function requireSite(siteId) {
  const state = await readState();
  const site = state.sites[siteId];
  if (!site) throw Object.assign(new Error('Site not found.'), { status: 404 });
  return site;
}

async function requireRunningSite(siteId, wordpressOnly = false) {
  const site = await requireSite(siteId);
  if (wordpressOnly && site.kind === 'lovable') throw Object.assign(new Error('This developer tool is only available for WordPress sites.'), { status: 409 });
  const inspect = await inspectContainer(site.wpContainer);
  if (!inspect?.State?.Running) throw Object.assign(new Error('Start the site before using this tool.'), { status: 409 });
  return { site, inspect };
}

function screenshotPath(siteId) {
  return path.join(screenshotRoot, `${siteId}.png`);
}

let browserExecutablePromise;
async function findBrowserExecutable() {
  browserExecutablePromise ||= (async () => {
    const candidates = process.platform === 'win32' ? [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ] : process.platform === 'darwin' ? [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ] : ['/usr/bin/google-chrome', '/usr/bin/microsoft-edge', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    for (const candidate of candidates) {
      if (!candidate) continue;
      try { if ((await stat(candidate)).isFile()) return candidate; } catch {}
    }
    throw Object.assign(new Error('Install Microsoft Edge or Google Chrome to capture site previews.'), { status: 503 });
  })();
  return browserExecutablePromise;
}

async function captureSiteScreenshot(siteId, options = {}) {
  const force = options.force === true;
  const existing = screenshotCaptures.get(siteId);
  if (existing) return existing;
  const task = (async () => {
    const { site, inspect } = await requireRunningSite(siteId);
    const destination = screenshotPath(siteId);
    if (!force) {
      try {
        const details = await stat(destination);
        if (Date.now() - details.mtimeMs < screenshotRefreshMs) {
          return { contents: await readFile(destination), capturedAt: site.screenshot?.capturedAt || details.mtime.toISOString(), width: 1440, height: 1000, fresh: true };
        }
      } catch {}
    }
    const portBinding = inspect.NetworkSettings?.Ports?.['80/tcp']?.[0]?.HostPort;
    const targetUrl = portBinding ? `http://127.0.0.1:${portBinding}` : `http://${site.domain}`;
    const browser = await findBrowserExecutable();
    const profileDirectory = path.join(screenshotRoot, `.browser-${siteId}-${randomUUID()}`);
    const temporary = path.join(screenshotRoot, `.${siteId}-${randomUUID()}.png`);
    await mkdir(screenshotRoot, { recursive: true });
    await mkdir(profileDirectory, { recursive: true });
    try {
      await execFileAsync(browser, [
        '--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--hide-scrollbars',
        '--no-first-run', '--allow-insecure-localhost', '--force-device-scale-factor=1', '--window-size=1440,1000',
        `--user-data-dir=${profileDirectory}`, `--screenshot=${temporary}`, '--virtual-time-budget=10000', targetUrl,
      ], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 45_000, windowsHide: true });
      const contents = await readFile(temporary);
      if (contents.length < 8 || contents.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('The browser did not produce a valid PNG preview.');
      await rename(temporary, destination);
      const capturedAt = new Date().toISOString();
      await setSiteState(siteId, { screenshot: { capturedAt, width: 1440, height: 1000 } });
      return { contents, capturedAt, width: 1440, height: 1000, fresh: true };
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
      await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
    }
  })();
  screenshotCaptures.set(siteId, task);
  try { return await task; } finally { screenshotCaptures.delete(siteId); }
}

async function getSiteScreenshot(siteId, options = {}) {
  return captureSiteScreenshot(siteId, options);
}

async function checkSiteUptime(siteId) {
  const site = await requireSite(siteId);
  const inspect = await inspectContainer(site.wpContainer);
  const checkedAt = new Date().toISOString();
  let check;
  if (!inspect?.State?.Running) {
    check = { checkedAt, ok: false, statusCode: null, latencyMs: null, error: 'Container is not running.' };
  } else {
    const portBinding = inspect.NetworkSettings?.Ports?.['80/tcp']?.[0]?.HostPort;
    const targetUrl = portBinding ? `http://127.0.0.1:${portBinding}` : `http://${site.domain}`;
    const started = performance.now();
    try {
      const response = await fetch(targetUrl, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
      check = { checkedAt, ok: response.ok, statusCode: response.status, latencyMs: Math.max(1, Math.round(performance.now() - started)), error: response.ok ? null : `HTTP ${response.status}` };
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      check = { checkedAt, ok: false, statusCode: null, latencyMs: Math.max(1, Math.round(performance.now() - started)), error: error.message || 'Uptime check failed.' };
    }
  }
  await updateState((state) => {
    const current = state.sites[siteId];
    if (!current) return;
    current.monitoring ||= { checks: [] };
    current.monitoring.checks = [check, ...(Array.isArray(current.monitoring.checks) ? current.monitoring.checks : [])].slice(0, 1008);
  });
  return check;
}

async function getSiteMonitoring(siteId, options = {}) {
  if (options.refresh === true) await checkSiteUptime(siteId);
  const site = await requireSite(siteId);
  const checks = Array.isArray(site.monitoring?.checks) ? site.monitoring.checks : [];
  return { ...monitoringSummary(site), checks };
}

async function refreshSiteCare() {
  const state = await readState();
  for (const site of Object.values(state.sites)) {
    if (site.phase || site.status === 'Stopped') continue;
    await checkSiteUptime(site.id).catch((error) => console.error(`Uptime check failed for ${site.name}:`, error.message));
  }
}

async function refreshSiteScreenshots() {
  const state = await readState();
  for (const site of Object.values(state.sites)) {
    if (site.phase || site.status === 'Stopped') continue;
    await captureSiteScreenshot(site.id, { force: true }).catch((error) => console.error(`Screenshot capture failed for ${site.name}:`, error.message));
  }
}

function validateDeveloperArguments(value, maximum = 50) {
  if (!Array.isArray(value) || !value.length || value.length > maximum) throw Object.assign(new Error('Provide a non-empty command argument array.'), { status: 400 });
  const args = value.map((item) => String(item));
  if (args.some((item) => !item || item.length > 500 || /[\u0000\r\n]/.test(item))) throw Object.assign(new Error('One or more command arguments are invalid.'), { status: 400 });
  return args;
}

async function getSiteLogs(siteId, options = {}) {
  const { site } = await requireRunningSite(siteId);
  const lines = Math.min(1000, Math.max(20, Number(options.lines) || 300));
  const application = await docker(['logs', '--tail', String(lines), '--timestamps', site.wpContainer], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  let database = null;
  if (site.dbContainer) database = await docker(['logs', '--tail', String(Math.min(lines, 300)), '--timestamps', site.dbContainer], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
  return {
    application: [application.stdout, application.stderr].filter(Boolean).join('\n'),
    database: database ? [database.stdout, database.stderr].filter(Boolean).join('\n') : null,
    readAt: new Date().toISOString(),
  };
}

async function runSiteWpCli(siteId, command) {
  const { site } = await requireRunningSite(siteId, true);
  const args = validateDeveloperArguments(command);
  const blocked = new Set(['eval', 'eval-file', 'shell']);
  const primary = args.find((arg) => !arg.startsWith('-')) || '';
  if (blocked.has(primary) || args.some((arg) => arg.startsWith('--require=') || arg.startsWith('--exec='))) {
    throw Object.assign(new Error('That WP-CLI command is disabled in the audited console.'), { status: 403 });
  }
  const result = await runWp(site, args, { timeout: 600_000 });
  await recordActivity({ siteId, siteName: site.name, type: 'developer.wp-cli', message: `An audited WP-CLI command ran for ${site.name}.` });
  return { ...result, command: ['wp', ...args], ranAt: new Date().toISOString() };
}

function isReadOnlySql(query) {
  const source = query.trim();
  const mutating = /\b(?:ALTER|CALL|CREATE|DELETE|DO|DROP|GRANT|HANDLER|INSERT|LOAD|LOCK|RENAME|REPLACE|REVOKE|SET|TRUNCATE|UNLOCK|UPDATE)\b/i.test(source);
  return !mutating && /^(?:SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i.test(source);
}

async function querySiteDatabase(siteId, query, options = {}) {
  const { site } = await requireRunningSite(siteId, true);
  const sql = String(query || '').trim();
  if (!sql || sql.length > 100_000 || /\u0000/.test(sql)) throw Object.assign(new Error('Enter a SQL query up to 100,000 characters.'), { status: 400 });
  const readOnly = isReadOnlySql(sql);
  if (!readOnly && options.allowWrites !== true) throw Object.assign(new Error('Set allowWrites to true before running a database-changing statement.'), { status: 409 });
  if (/\b(?:INTO\s+OUTFILE|LOAD_FILE|LOAD\s+DATA)\b/i.test(sql)) throw Object.assign(new Error('Database filesystem operations are disabled.'), { status: 403 });
  const result = await docker(['exec', '-e', `MYSQL_PWD=${site.secrets.dbRootPassword}`, site.dbContainer, 'mariadb', '-uroot', '--batch', '--raw', 'wordpress', '-e', sql], { timeout: 300_000, maxBuffer: 8 * 1024 * 1024 });
  await recordActivity({ siteId, siteName: site.name, type: 'developer.database', message: `${readOnly ? 'A database query' : 'A database change'} ran for ${site.name}.` });
  return { ...result, readOnly, ranAt: new Date().toISOString() };
}

const editableSiteFileExtensions = new Set(['.css', '.html', '.htm', '.js', '.json', '.md', '.php', '.txt', '.twig', '.xml', '.yml', '.yaml']);
function scopedSiteFilePath(value) {
  const source = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!source || source.length > 300 || /[\u0000-\u001f]/.test(source)) throw Object.assign(new Error('Enter a valid file path inside wp-content.'), { status: 400 });
  const relative = path.posix.normalize(source.startsWith('wp-content/') ? source.slice('wp-content/'.length) : source);
  if (!relative || relative === '.' || relative.startsWith('../') || relative.includes('/../')) throw Object.assign(new Error('The file must stay inside wp-content.'), { status: 400 });
  if (relative.toLowerCase() === 'mu-plugins/geekheros-control-plane.php') throw Object.assign(new Error('The GeekHeros control-plane MU-plugin is protected.'), { status: 403 });
  const extension = path.posix.extname(relative).toLowerCase();
  if (!editableSiteFileExtensions.has(extension) && path.posix.basename(relative) !== '.htaccess') throw Object.assign(new Error('The code editor supports text and web source files only.'), { status: 400 });
  return { relative, absolute: `/var/www/html/wp-content/${relative}` };
}

async function listSiteFiles(siteId, options = {}) {
  const { site } = await requireRunningSite(siteId, true);
  const limit = Math.min(500, Math.max(10, Number(options.limit) || 200));
  const result = await docker(['exec', site.wpContainer, 'find', '/var/www/html/wp-content', '-maxdepth', '5', '-type', 'f'], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  const files = result.stdout.split(/\r?\n/).filter(Boolean).map((file) => file.replace('/var/www/html/', '')).filter((file) => {
    const extension = path.posix.extname(file).toLowerCase();
    return editableSiteFileExtensions.has(extension) || path.posix.basename(file) === '.htaccess';
  }).slice(0, limit);
  return { files, truncated: files.length === limit, readAt: new Date().toISOString() };
}

async function readSiteFile(siteId, filePath) {
  const { site } = await requireRunningSite(siteId, true);
  const target = scopedSiteFilePath(filePath);
  const result = await docker(['exec', site.wpContainer, 'base64', '-w', '0', target.absolute], { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
  const contents = Buffer.from(result.stdout, 'base64');
  if (contents.length > 1_000_000) throw Object.assign(new Error('The file is too large for the code editor.'), { status: 413 });
  return { path: `wp-content/${target.relative}`, content: contents.toString('utf8'), size: contents.length, readAt: new Date().toISOString() };
}

async function writeSiteFile(siteId, filePath, content) {
  const { site } = await requireRunningSite(siteId, true);
  const target = scopedSiteFilePath(filePath);
  const contents = Buffer.from(String(content ?? ''), 'utf8');
  if (contents.length > 1_000_000) throw Object.assign(new Error('Code editor files may be up to 1 MB.'), { status: 413 });
  await dockerFromBuffer(['exec', '-i', '--user', '33:33', site.wpContainer, 'sh', '-c', 'mkdir -p "$(dirname "$1")" && cat > "$1"', '--', target.absolute], contents, 120_000);
  await recordActivity({ siteId, siteName: site.name, type: 'developer.file-write', message: `${target.relative} was updated for ${site.name}.` });
  return { path: `wp-content/${target.relative}`, size: contents.length, savedAt: new Date().toISOString() };
}

async function runSiteTerminalCommand(siteId, command) {
  const { site, inspect } = await requireRunningSite(siteId);
  const args = validateDeveloperArguments(command, 30);
  const executable = args.shift();
  const allowed = new Set(['cat', 'df', 'du', 'find', 'grep', 'head', 'ls', 'php', 'pwd', 'stat', 'tail']);
  if (!allowed.has(executable)) throw Object.assign(new Error(`The audited terminal does not allow ${executable}.`), { status: 403 });
  if (args.some((arg) => arg.includes('\0') || arg === '..' || arg.startsWith('../') || arg.includes('/../'))) throw Object.assign(new Error('Terminal paths must stay inside the site workspace.'), { status: 400 });
  const workingDirectory = site.kind === 'lovable' ? inspect.Config?.WorkingDir || '/usr/share/nginx/html' : '/var/www/html';
  if (args.some((arg) => arg.startsWith('/') && arg !== workingDirectory && !arg.startsWith(`${workingDirectory}/`))) throw Object.assign(new Error('Terminal paths must stay inside the site workspace.'), { status: 400 });
  if (executable === 'find' && args.some((arg) => ['-delete', '-exec', '-execdir', '-fprint', '-fprintf', '-fls', '-ok', '-okdir'].includes(arg))) throw Object.assign(new Error('Mutating find actions are disabled in the audited terminal.'), { status: 403 });
  if (executable === 'php' && args.some((arg) => !['-i', '--info', '-m', '--modules', '-v', '--version'].includes(arg))) throw Object.assign(new Error('The audited terminal limits PHP to version, module and configuration inspection.'), { status: 403 });
  if (executable === 'tail' && args.some((arg) => arg === '-f' || arg === '--follow' || arg.startsWith('--follow='))) throw Object.assign(new Error('Follow mode is disabled; request a bounded log read instead.'), { status: 403 });
  const result = await docker(['exec', '--workdir', workingDirectory, site.wpContainer, executable, ...args], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  await recordActivity({ siteId, siteName: site.name, type: 'developer.terminal', message: `An audited container command ran for ${site.name}.` });
  return { ...result, command: [executable, ...args], workingDirectory, ranAt: new Date().toISOString() };
}

async function getSiteRuntime(siteId) {
  const { site, inspect } = await requireRunningSite(siteId);
  return {
    container: site.wpContainer,
    databaseContainer: site.dbContainer || null,
    image: inspect.Config?.Image || site.image,
    state: inspect.State?.Status || 'unknown',
    startedAt: inspect.State?.StartedAt || null,
    restartCount: Number(inspect.RestartCount || 0),
    platform: inspect.Platform || null,
    workingDirectory: inspect.Config?.WorkingDir || null,
    network: site.network,
    ports: inspect.NetworkSettings?.Ports || {},
    resources: { memoryBytes: Number(inspect.HostConfig?.Memory || 0), nanoCpus: Number(inspect.HostConfig?.NanoCpus || 0) },
    readAt: new Date().toISOString(),
  };
}

async function updateSiteMetadata(siteId, input) {
  const state = await readState();
  const site = state.sites[siteId];
  if (!site) throw Object.assign(new Error('Site not found.'), { status: 404 });
  const patch = {};
  if (Object.hasOwn(input, 'clientId')) {
    const clientId = input.clientId ? String(input.clientId) : null;
    if (clientId && !state.clients[clientId]) throw new Error('The selected client no longer exists.');
    patch.clientId = clientId;
  }
  if (Object.hasOwn(input, 'tags')) patch.tags = validateTags(input.tags);
  if (site.kind === 'lovable' && Object.hasOwn(input, 'lovableProjectId')) {
    const lovableProjectId = String(input.lovableProjectId || '').trim();
    if (!lovableProjectId || lovableProjectId.length > 200) throw new Error('Enter a valid Lovable project ID.');
    patch.lovableProjectId = lovableProjectId;
    patch.sourceProvider = 'lovable';
  }
  if (site.kind === 'lovable' && Object.hasOwn(input, 'lovableWorkspaceId')) {
    const lovableWorkspaceId = String(input.lovableWorkspaceId || '').trim();
    const workspaces = lovableIntegration(state).profile?.workspaces || [];
    if (!lovableWorkspaceId || !workspaces.some((workspace) => workspace.id === lovableWorkspaceId)) throw new Error('Choose an available Lovable workspace.');
    patch.lovableWorkspaceId = lovableWorkspaceId;
  }
  await setSiteState(siteId, patch);
  const current = await requireSite(siteId);
  await recordActivity({ siteId, siteName: site.name, type: 'metadata', message: `${site.name} settings were updated.` });
  return publicSite(current, await inspectContainer(current.wpContainer));
}

function publicClient(client, sites) {
  const assignedSites = sites.filter((site) => site.clientId === client.id);
  return {
    id: client.id,
    name: client.name,
    company: client.company || '',
    email: client.email || '',
    phone: client.phone || '',
    notes: client.notes || '',
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    siteCount: assignedSites.length,
    runningSiteCount: assignedSites.filter((site) => site.status === 'Running').length,
  };
}

async function listClients() {
  const state = await readState();
  const sites = await Promise.all(Object.values(state.sites).map(async (site) => publicSite(site, await inspectContainer(site.wpContainer))));
  return Object.values(state.clients)
    .map((client) => publicClient(client, sites))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function createClient(input) {
  const values = validateClientInput(input);
  const id = `client_${randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();
  const client = { id, ...values, createdAt: now, updatedAt: now };
  await updateState((state) => { state.clients[id] = client; });
  await recordActivity({ siteId: '', siteName: client.name, type: 'client.create', message: `${client.name} was added as a client.` });
  return publicClient(client, []);
}

async function updateClient(clientId, input) {
  const values = validateClientInput(input, true);
  const client = await updateState((state) => {
    if (!state.clients[clientId]) throw Object.assign(new Error('Client not found.'), { status: 404 });
    Object.assign(state.clients[clientId], values, { updatedAt: new Date().toISOString() });
    return state.clients[clientId];
  });
  const sites = await listSites();
  await recordActivity({ siteId: '', siteName: client.name, type: 'client.update', message: `${client.name}'s client record was updated.` });
  return publicClient(client, sites);
}

async function deleteClient(clientId) {
  const client = await updateState((state) => {
    const current = state.clients[clientId];
    if (!current) throw Object.assign(new Error('Client not found.'), { status: 404 });
    for (const site of Object.values(state.sites)) {
      if (site.clientId === clientId) site.clientId = null;
    }
    delete state.clients[clientId];
    return current;
  });
  await recordActivity({ siteId: '', siteName: client.name, type: 'client.delete', message: `${client.name} was removed; assigned sites were kept.` });
  return { deleted: true };
}

async function getSiteInventory(siteId) {
  const site = await requireSite(siteId);
  if (site.kind === 'lovable') throw Object.assign(new Error('Lovable sites use source deployments instead of WordPress package inventory.'), { status: 409 });
  const inventory = await readInventory(site);
  await setSiteState(site.id, {
    wpVersion: inventory.core.version,
    updates: inventory.updates.core + inventory.updates.plugins + inventory.updates.themes,
    updateCounts: inventory.updates,
    lastScannedAt: inventory.readAt,
  });
  return inventory;
}

async function issueOneClickLogin(siteId) {
  const site = await requireSite(siteId);
  if (site.kind === 'lovable') throw Object.assign(new Error('One-click WP Admin is only available for WordPress sites.'), { status: 409 });
  const inspect = await inspectContainer(site.wpContainer);
  if (!inspect?.State?.Running) throw Object.assign(new Error('Start the WordPress container before opening WP Admin.'), { status: 409 });
  await ensureControlPlaneMuPlugin(site);
  const userId = Number((await runWp(site, ['user', 'get', site.adminUser, '--field=ID'], { timeout: 60_000 })).stdout);
  if (!Number.isInteger(userId) || userId < 1) throw new Error('The managed WordPress administrator account could not be found.');
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const transient = `geekheros_login_${tokenHash}`;
  await runWp(site, ['transient', 'set', transient, JSON.stringify({ user_id: userId }), '60'], { timeout: 60_000 });
  const directPort = await getDirectPort(site.wpContainer);
  const baseUrl = directPort ? `http://127.0.0.1:${directPort}` : `http://${site.domain}`;
  await recordActivity({ siteId, siteName: site.name, type: 'one-click-login', message: `A one-time WP Admin session was issued for ${site.name}.` });
  return {
    actionUrl: `${baseUrl}/wp-admin/admin-post.php`,
    action: 'geekheros_login',
    token,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

async function createBackup(site) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const siteBackupDir = path.join(backupRoot, site.id);
  await mkdir(siteBackupDir, { recursive: true });
  if (site.kind === 'lovable') {
    const filesName = `${stamp}-lovable-source.tar.gz`;
    const sourceDirectory = lovableSourceDirectory(site);
    try { await readFile(path.join(sourceDirectory, 'package.json')); } catch { throw new Error('The Lovable source checkout is unavailable. Redeploy the site before creating a backup.'); }
    await docker(['run', '--rm', '-v', `${sourceDirectory}:/source:ro`, '-v', `${siteBackupDir}:/backups`, 'alpine:latest', 'tar', '-czf', `/backups/${filesName}`, '-C', '/source', '.'], { timeout: 600_000 });
    const backup = { id: randomUUID(), createdAt: new Date().toISOString(), files: [filesName] };
    await updateState((state) => { state.sites[site.id].backups.unshift(backup); });
    return backup;
  }
  const databaseFile = path.join(siteBackupDir, `${stamp}-database.sql`);
  const filesName = `${stamp}-wordpress.tar.gz`;
  await dockerToFile(['exec', '-e', `MYSQL_PWD=${site.secrets.dbRootPassword}`, site.dbContainer, 'mariadb-dump', '-uroot', 'wordpress'], databaseFile);
  await docker(['run', '--rm', '-v', `${site.wpVolume}:/source:ro`, '-v', `${siteBackupDir}:/backups`, 'alpine:latest', 'tar', '-czf', `/backups/${filesName}`, '-C', '/source', '.'], { timeout: 600_000 });
  const backup = { id: randomUUID(), createdAt: new Date().toISOString(), files: [path.basename(databaseFile), filesName] };
  await updateState((state) => { state.sites[site.id].backups.unshift(backup); });
  return backup;
}

async function restoreBackup(site, backupId, scope = 'all') {
  if (site.kind === 'lovable') throw Object.assign(new Error('Source restore is not yet available for Lovable builds; redeploy the current source instead.'), { status: 409 });
  if (!['all', 'files', 'database'].includes(scope)) throw Object.assign(new Error('Choose all, files or database for the restore scope.'), { status: 400 });
  const backup = (Array.isArray(site.backups) ? site.backups : []).find((entry) => entry.id === String(backupId || ''));
  if (!backup) throw Object.assign(new Error('Backup not found.'), { status: 404 });
  const siteBackupDir = path.join(backupRoot, site.id);
  const databaseName = backup.files.find((file) => file.endsWith('-database.sql'));
  const filesName = backup.files.find((file) => file.endsWith('-wordpress.tar.gz'));
  if (backup.files.some((file) => path.basename(file) !== file)) throw new Error('The backup contains an invalid file reference.');
  if ((scope === 'all' || scope === 'database') && !databaseName) throw new Error('This recovery point does not contain a database export.');
  if ((scope === 'all' || scope === 'files') && !filesName) throw new Error('This recovery point does not contain a WordPress file archive.');
  await createBackup(site);
  await docker(['stop', '-t', '20', site.wpContainer]).catch((error) => { if (!/is not running/i.test(error.message)) throw error; });
  try {
    await docker(['start', site.dbContainer]).catch((error) => { if (!/is already running/i.test(error.message)) throw error; });
    await waitForDatabase(site, 120_000);
    if (scope === 'all' || scope === 'files') {
      await docker([
        'run', '--rm', '-v', `${site.wpVolume}:/target`, '-v', `${siteBackupDir}:/backups:ro`, 'alpine:latest',
        'sh', '-c', 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar -xzf "/backups/$1" -C /target', '--', filesName,
      ], { timeout: 600_000 });
    }
    if (scope === 'all' || scope === 'database') {
      await dockerFromFile(['exec', '-i', '-e', `MYSQL_PWD=${site.secrets.dbRootPassword}`, site.dbContainer, 'mariadb', '-uroot', 'wordpress'], path.join(siteBackupDir, databaseName));
    }
  } finally {
    await docker(['start', site.wpContainer]).catch(() => undefined);
  }
  await ensureLocalPreviewConfig(site);
  await ensureControlPlaneMuPlugin(site);
  await refreshVersions(site);
  return { backupId: backup.id, scope, restoredAt: new Date().toISOString() };
}

async function runOperation(siteId, type, input = {}) {
  const site = await requireSite(siteId);
  const operation = String(type || '').replace(/^site\./, '');
  if (!['start', 'stop', 'restart', 'refresh', 'backup', 'restore-backup', 'update', 'redeploy', 'update-core', 'update-plugins', 'update-themes', 'activate-plugin', 'deactivate-plugin', 'activate-theme', 'scan', 'delete'].includes(operation)) {
    throw Object.assign(new Error('Unsupported operation.'), { status: 400 });
  }
  if (site.phase) throw Object.assign(new Error(`The site is currently ${site.phase.toLowerCase()}.`), { status: 409 });

  if (operation === 'delete') {
    await docker(['rm', '-f', site.wpContainer]).catch((error) => { if (!/No such/i.test(error.message)) throw error; });
    if (site.dbContainer) await docker(['rm', '-f', site.dbContainer]).catch((error) => { if (!/No such/i.test(error.message)) throw error; });
    await docker(['network', 'rm', site.network]).catch(() => undefined);
    if (input.deleteData === true) {
      if (site.wpVolume) await docker(['volume', 'rm', '-f', site.wpVolume]).catch(() => undefined);
      if (site.dbVolume) await docker(['volume', 'rm', '-f', site.dbVolume]).catch(() => undefined);
      await rm(path.join(backupRoot, site.id), { recursive: true, force: true });
      await rm(lovableSourceDirectory(site), { recursive: true, force: true });
      if (site.kind === 'lovable') await docker(['image', 'rm', '-f', site.image]).catch(() => undefined);
    }
    await updateState((state) => { delete state.sites[site.id]; });
    await rm(screenshotPath(site.id), { force: true }).catch(() => undefined);
    await recordActivity({ siteId, siteName: site.name, type: operation, message: `${site.name} was removed${input.deleteData ? ' with its data' : '; volumes were preserved'}.` });
    return { deleted: true };
  }

  await setSiteState(site.id, { phase: `${operation[0].toUpperCase()}${operation.slice(1)} in progress`, error: null });
  try {
    if (site.kind === 'lovable') {
      if (operation === 'restore-backup') throw Object.assign(new Error('Lovable builds are restored by redeploying their current source.'), { status: 409 });
      if (['update-core', 'update-plugins', 'update-themes', 'activate-plugin', 'deactivate-plugin', 'activate-theme'].includes(operation)) {
        throw Object.assign(new Error('WordPress package operations are not available for Lovable sites.'), { status: 409 });
      }
      if (operation === 'start') {
        await docker(['start', site.wpContainer]);
      } else if (operation === 'stop') {
        await docker(['stop', '-t', '20', site.wpContainer]);
      } else if (operation === 'restart') {
        await docker(['restart', '-t', '20', site.wpContainer]);
      } else if (operation === 'refresh') {
        await refreshLovableSourceStatus(site);
      } else if (operation === 'backup') {
        await createBackup(site);
      } else if (operation === 'update' || operation === 'redeploy') {
        if (site.sourceRevision) await createBackup(site);
        await deployLovableSite(site, true);
      } else if (operation === 'scan') {
        await refreshLovableSourceStatus(site);
        await readFile(path.join(lovableSourceDirectory(site), 'package.json'));
      }
      const nextStatus = operation === 'stop' ? 'Stopped' : 'Running';
      await setSiteState(site.id, { phase: null, status: nextStatus, error: null });
      await recordActivity({ siteId, siteName: site.name, type: operation, message: `${site.name}: ${operation} completed.` });
      const current = await requireSite(site.id);
      return { site: publicSite(current, await inspectContainer(current.wpContainer)) };
    }
    if (operation === 'start') {
      await docker(['start', site.dbContainer]);
      await waitForDatabase(site, 120_000);
      await docker(['start', site.wpContainer]);
    } else if (operation === 'stop') {
      await docker(['stop', '-t', '20', site.wpContainer]);
      await docker(['stop', '-t', '20', site.dbContainer]);
    } else if (operation === 'restart') {
      await docker(['restart', '-t', '20', site.dbContainer]);
      await waitForDatabase(site, 120_000);
      await docker(['restart', '-t', '20', site.wpContainer]);
    } else if (operation === 'refresh') {
      await refreshVersions(site);
    } else if (operation === 'backup') {
      await createBackup(site);
    } else if (operation === 'restore-backup') {
      await restoreBackup(site, input.backupId, String(input.restoreScope || 'all'));
    } else if (operation === 'update') {
      await createBackup(site);
      await runWp(site, ['core', 'update'], { timeout: 600_000 });
      await runWp(site, ['core', 'update-db'], { timeout: 300_000 });
      await runWp(site, ['plugin', 'update', '--all'], { timeout: 600_000 });
      await runWp(site, ['theme', 'update', '--all'], { timeout: 600_000 });
      await refreshVersions(site);
    } else if (operation === 'update-core') {
      await createBackup(site);
      await runWp(site, ['core', 'update'], { timeout: 600_000 });
      await runWp(site, ['core', 'update-db'], { timeout: 300_000 });
      await refreshVersions(site);
    } else if (operation === 'update-plugins') {
      const packages = validatePackageNames(input.packages);
      await createBackup(site);
      await runWp(site, ['plugin', 'update', ...(packages.length ? packages : ['--all'])], { timeout: 600_000 });
      await refreshVersions(site);
    } else if (operation === 'update-themes') {
      const packages = validatePackageNames(input.packages);
      await createBackup(site);
      await runWp(site, ['theme', 'update', ...(packages.length ? packages : ['--all'])], { timeout: 600_000 });
      await refreshVersions(site);
    } else if (operation === 'activate-plugin' || operation === 'deactivate-plugin') {
      const packages = validatePackageNames(input.packages);
      if (packages.length !== 1) throw new Error('Choose one plugin.');
      await runWp(site, ['plugin', operation === 'activate-plugin' ? 'activate' : 'deactivate', packages[0]], { timeout: 120_000 });
    } else if (operation === 'activate-theme') {
      const packages = validatePackageNames(input.packages);
      if (packages.length !== 1) throw new Error('Choose one theme.');
      await runWp(site, ['theme', 'activate', packages[0]], { timeout: 120_000 });
    } else if (operation === 'scan') {
      await runWp(site, ['core', 'verify-checksums'], { timeout: 300_000 });
      await runWp(site, ['plugin', 'verify-checksums', '--all', '--strict'], { timeout: 300_000 });
      await setSiteState(site.id, { lastScannedAt: new Date().toISOString() });
    }
    if (operation === 'start' || operation === 'restart') {
      await ensureLocalPreviewConfig(site);
      await ensureControlPlaneMuPlugin(site);
    }
    const nextStatus = operation === 'stop' ? 'Stopped' : 'Running';
    await setSiteState(site.id, { phase: null, status: nextStatus, error: null });
    await recordActivity({ siteId, siteName: site.name, type: operation, message: `${site.name}: ${operation} completed.` });
    const current = await requireSite(site.id);
    return { site: publicSite(current, await inspectContainer(current.wpContainer)) };
  } catch (error) {
    const container = await inspectContainer(site.wpContainer).catch(() => null);
    await setSiteState(site.id, { phase: null, status: container?.State?.Running ? 'Running' : 'Stopped', error: error.message || `${operation} failed.` });
    await recordActivity({ siteId, siteName: site.name, type: operation, state: 'failed', message: error.message || `${operation} failed.` });
    throw error;
  }
}

function mcpConnectionConfiguration(token) {
  const connectionHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const url = `http://${connectionHost}:${port}/mcp`;
  return {
    enabled: true,
    url,
    toolCount: controlPlaneMcpToolCount,
    config: {
      mcpServers: {
        'geekheros-control-plane': {
          type: 'http',
          url,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
  };
}

async function systemInfo(includeMcpConnection = false) {
  const { stdout } = await docker(['info', '--format', '{{json .}}'], { timeout: 30_000 });
  const info = JSON.parse(stdout);
  const edge = await inspectContainer(edgeContainer);
  const sites = await listSites();
  const result = {
    connected: true,
    dockerVersion: info.ServerVersion,
    operatingSystem: info.OperatingSystem,
    cpuCount: info.NCPU,
    memoryBytes: info.MemTotal,
    totalContainers: info.Containers,
    runningContainers: info.ContainersRunning,
    managedSites: sites.length,
    runningSites: sites.filter((site) => site.status === 'Running').length,
    provisioningSites: sites.filter((site) => site.status === 'Provisioning').length,
    attentionSites: sites.filter((site) => ['Error', 'Attention'].includes(site.status)).length,
    edge: { installed: Boolean(edge), running: Boolean(edge?.State?.Running), container: edgeContainer, httpPort: 80, httpsPort: 443 },
    agent: { host, port },
  };
  if (includeMcpConnection) result.mcp = mcpConnectionConfiguration(await ensureMcpToken());
  return result;
}

function secureTokenMatches(expected, provided) {
  if (!expected || !provided) return false;
  const expectedHash = createHash('sha256').update(expected).digest();
  const providedHash = createHash('sha256').update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
}

function tokenMatches(provided) {
  return secureTokenMatches(authToken, provided);
}

function bearerToken(request) {
  const authorization = String(request.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function corsHeaders(response) {
  const origin = response.geekherosCorsOrigin;
  return origin ? {
    'access-control-allow-origin': origin,
    'access-control-allow-private-network': 'true',
    'private-network-access-name': 'geekheros-control-plane',
    'private-network-access-id': privateNetworkAccessId,
    'vary': 'Origin',
  } : {};
}

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...corsHeaders(response),
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

function sendScreenshot(response, screenshot) {
  response.writeHead(200, {
    ...corsHeaders(response),
    'content-type': 'image/png',
    'content-length': screenshot.contents.length,
    'cache-control': 'private, no-cache, must-revalidate',
    'x-geekheros-captured-at': screenshot.capturedAt,
    'x-content-type-options': 'nosniff',
  });
  response.end(screenshot.contents);
}

function sendMcpError(response, status, message) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'www-authenticate': 'Bearer realm="GeekHeros Control Plane"',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message }, id: null }));
}

function sendLovableCallback(response, status, success) {
  const title = success ? 'Lovable connected' : 'Lovable connection failed';
  const message = success
    ? 'Your Lovable account is now linked to GeekHeros. You can close this window.'
    : 'Return to GeekHeros Settings and start the Lovable connection again.';
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7f5;color:#29372f;font:16px system-ui,sans-serif}.card{width:min(440px,calc(100% - 40px));padding:32px;border:1px solid #dfe5e1;border-radius:16px;background:white;box-shadow:0 18px 55px rgba(8,18,12,.12)}h1{margin:0 0 10px;font:600 26px Georgia,serif}p{margin:0;color:#69766f;line-height:1.6}</style></head><body><main class="card"><h1>${title}</h1><p>${message}</p></main><script>if(${success ? 'true' : 'false'})setTimeout(()=>window.close(),1200)</script></body></html>`;
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  response.end(body);
}

async function readJson(request, maximumBytes = 1_000_000) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maximumBytes) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  }
  if (!body) return {};
  try { return JSON.parse(body); } catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

const controlPlaneMcpHandler = createControlPlaneMcpHandler({
  getSystemInfo: () => systemInfo(false),
  listActivity: async ({ limit, siteId }) => (await readState()).activity.filter((entry) => !siteId || entry.siteId === siteId).slice(0, limit),
  listSites,
  launchSite: createSite,
  updateSiteMetadata,
  getSiteInventory,
  getSiteScreenshot,
  getSiteMonitoring,
  getSiteLogs,
  getSiteRuntime,
  runSiteWpCli,
  querySiteDatabase,
  listSiteFiles,
  readSiteFile,
  writeSiteFile,
  runSiteTerminalCommand,
  issueWordPressLogin: issueOneClickLogin,
  runSiteOperation: runOperation,
  listClients,
  createClient,
  updateClient,
  deleteClient,
  listBlueprints,
  createBlueprint,
  deleteBlueprint,
  getLovableConnection,
  startLovableConnection,
  disconnectLovable,
  createLovableProject,
});
const handleMcpRequest = toNodeHandler(controlPlaneMcpHandler, {
  onerror: (error) => console.error('MCP transport failed:', error.message),
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`);
  if (request.method === 'GET' && url.pathname === '/lovable/oauth/callback') {
    try {
      await finishLovableConnection(url.searchParams);
      return sendLovableCallback(response, 200, true);
    } catch (error) {
      console.error('Lovable OAuth callback failed:', error.message);
      return sendLovableCallback(response, Number(error.status) || 400, false);
    }
  }
  const origin = request.headers.origin;
  const localDashboardOrigin = Boolean(origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin));
  const hostedDashboardOrigin = Boolean(origin && hostedDashboardOrigins.has(origin));
  if (origin && !localDashboardOrigin && !hostedDashboardOrigin) return send(response, 403, { error: 'Origin not allowed.' });
  if (origin) response.geekherosCorsOrigin = origin;
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...corsHeaders(response),
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, x-geekheros-token',
      'access-control-max-age': '600',
      'vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    });
    response.end();
    return undefined;
  }
  if (url.pathname === '/mcp') {
    try {
      const contentLength = Number(request.headers['content-length'] || 0);
      if (contentLength > 105_000_000) return sendMcpError(response, 413, 'MCP request body is too large.');
      const expected = await ensureMcpToken();
      if (!secureTokenMatches(expected, bearerToken(request))) return sendMcpError(response, 401, 'MCP authentication failed.');
      return handleMcpRequest(request, response);
    } catch (error) {
      console.error('MCP endpoint failed:', error.message);
      if (!response.headersSent) return sendMcpError(response, Number(error.status) || 500, error.message || 'MCP endpoint failed.');
      response.end();
      return undefined;
    }
  }
  if (!hostedDashboardOrigin && !tokenMatches(request.headers['x-geekheros-token'])) return send(response, 401, { error: 'Agent authentication failed.' });
  try {
    if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, await systemInfo(true));
    if (request.method === 'GET' && url.pathname === '/lovable') return send(response, 200, await getLovableConnection());
    if (request.method === 'POST' && url.pathname === '/lovable/connect') return send(response, 200, await startLovableConnection());
    if (request.method === 'DELETE' && url.pathname === '/lovable') return send(response, 200, await disconnectLovable());
    if (request.method === 'POST' && url.pathname === '/lovable/projects') return send(response, 201, { project: await createLovableProject(await readJson(request)) });
    if (request.method === 'GET' && url.pathname === '/sites') return send(response, 200, { sites: await listSites() });
    if (request.method === 'POST' && url.pathname === '/sites') return send(response, 202, { site: await createSite(await readJson(request)) });
    if (request.method === 'GET' && url.pathname === '/blueprints') return send(response, 200, { blueprints: await listBlueprints() });
    if (request.method === 'POST' && url.pathname === '/blueprints') return send(response, 201, { blueprint: await createBlueprint(await readJson(request, 105_000_000)) });
    if (request.method === 'GET' && url.pathname === '/clients') return send(response, 200, { clients: await listClients() });
    if (request.method === 'POST' && url.pathname === '/clients') return send(response, 201, { client: await createClient(await readJson(request)) });
    if (request.method === 'GET' && url.pathname === '/activity') {
      const state = await readState();
      return send(response, 200, { activity: state.activity });
    }
    const clientMatch = url.pathname.match(/^\/clients\/([^/]+)$/);
    if (clientMatch && request.method === 'PATCH') return send(response, 200, { client: await updateClient(decodeURIComponent(clientMatch[1]), await readJson(request)) });
    if (clientMatch && request.method === 'DELETE') return send(response, 200, await deleteClient(decodeURIComponent(clientMatch[1])));
    const blueprintMatch = url.pathname.match(/^\/blueprints\/([^/]+)$/);
    if (blueprintMatch && request.method === 'DELETE') return send(response, 200, await deleteBlueprint(decodeURIComponent(blueprintMatch[1])));
    const screenshotMatch = url.pathname.match(/^\/sites\/([^/]+)\/screenshot$/);
    if (screenshotMatch && request.method === 'GET') return sendScreenshot(response, await getSiteScreenshot(decodeURIComponent(screenshotMatch[1])));
    if (screenshotMatch && request.method === 'POST') {
      const screenshot = await getSiteScreenshot(decodeURIComponent(screenshotMatch[1]), { force: true });
      return send(response, 200, { screenshot: { capturedAt: screenshot.capturedAt, width: screenshot.width, height: screenshot.height } });
    }
    const monitoringMatch = url.pathname.match(/^\/sites\/([^/]+)\/monitoring$/);
    if (monitoringMatch && request.method === 'GET') return send(response, 200, { monitoring: await getSiteMonitoring(decodeURIComponent(monitoringMatch[1]), { refresh: url.searchParams.get('refresh') === '1' }) });
    const developerMatch = url.pathname.match(/^\/sites\/([^/]+)\/developer$/);
    if (developerMatch && request.method === 'GET') {
      const siteId = decodeURIComponent(developerMatch[1]);
      const tool = url.searchParams.get('tool');
      if (tool === 'logs') return send(response, 200, { result: await getSiteLogs(siteId, { lines: url.searchParams.get('lines') }) });
      if (tool === 'runtime') return send(response, 200, { result: await getSiteRuntime(siteId) });
      if (tool === 'files') return send(response, 200, { result: await listSiteFiles(siteId, { limit: url.searchParams.get('limit') }) });
      if (tool === 'file') return send(response, 200, { result: await readSiteFile(siteId, url.searchParams.get('path')) });
      throw Object.assign(new Error('Choose logs, runtime, files or file.'), { status: 400 });
    }
    if (developerMatch && request.method === 'POST') {
      const siteId = decodeURIComponent(developerMatch[1]);
      const body = await readJson(request, 5_000_000);
      if (body.tool === 'wp-cli') return send(response, 200, { result: await runSiteWpCli(siteId, body.args) });
      if (body.tool === 'database') return send(response, 200, { result: await querySiteDatabase(siteId, body.query, { allowWrites: body.allowWrites === true }) });
      if (body.tool === 'write-file') return send(response, 200, { result: await writeSiteFile(siteId, body.path, body.content) });
      if (body.tool === 'terminal') return send(response, 200, { result: await runSiteTerminalCommand(siteId, body.args) });
      throw Object.assign(new Error('Choose wp-cli, database, write-file or terminal.'), { status: 400 });
    }
    const siteMatch = url.pathname.match(/^\/sites\/([^/]+)$/);
    if (siteMatch && request.method === 'PATCH') return send(response, 200, { site: await updateSiteMetadata(decodeURIComponent(siteMatch[1]), await readJson(request)) });
    const inventoryMatch = url.pathname.match(/^\/sites\/([^/]+)\/inventory$/);
    if (inventoryMatch && request.method === 'GET') return send(response, 200, { inventory: await getSiteInventory(decodeURIComponent(inventoryMatch[1])) });
    const loginMatch = url.pathname.match(/^\/sites\/([^/]+)\/login$/);
    if (loginMatch && request.method === 'POST') return send(response, 200, { login: await issueOneClickLogin(decodeURIComponent(loginMatch[1])) });
    const operationMatch = url.pathname.match(/^\/sites\/([^/]+)\/operations$/);
    if (request.method === 'POST' && operationMatch) {
      const body = await readJson(request);
      return send(response, 200, { operation: await runOperation(decodeURIComponent(operationMatch[1]), body.type, body) });
    }
    return send(response, 404, { error: 'Not found.' });
  } catch (error) {
    console.error(error);
    return send(response, Number(error.status) || 500, { error: error.message || 'Agent request failed.' });
  }
});

server.listen(port, host, async () => {
  console.log(`GeekHeros Docker agent listening on http://${host}:${port}`);
  try {
    const state = await readState();
    for (const site of Object.values(state.sites)) {
      if (site.phase || site.status === 'Provisioning') {
        void provisionSite(site.id);
      } else {
        const container = await inspectContainer(site.wpContainer).catch(() => null);
        if (container?.State?.Running && site.kind !== 'lovable') {
          await ensureLocalPreviewConfig(site).catch((error) => {
            console.error(`Unable to enable local preview for ${site.name}:`, error.message);
          });
          await ensureControlPlaneMuPlugin(site).catch((error) => {
            console.error(`Unable to install the control-plane MU-plugin for ${site.name}:`, error.message);
          });
        }
      }
    }
  } catch (error) {
    console.error('Unable to resume pending sites:', error.message);
  }
  setTimeout(() => void refreshSiteCare(), 5_000).unref();
  setTimeout(() => void refreshSiteScreenshots(), 15_000).unref();
  setInterval(() => void refreshSiteCare(), uptimeCheckIntervalMs).unref();
  setInterval(() => void refreshSiteScreenshots(), screenshotRefreshMs).unref();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
