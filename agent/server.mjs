import { createServer } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = path.join(projectRoot, '.geekheros');
const stateFile = path.join(stateDir, 'state.json');
const backupRoot = path.join(stateDir, 'backups');
const host = process.env.GEEKHEROS_AGENT_HOST || '127.0.0.1';
const port = Number(process.env.GEEKHEROS_AGENT_PORT || 8788);
const authToken = process.env.GEEKHEROS_AGENT_TOKEN;
const edgeNetwork = 'geekheros-edge';
const edgeContainer = 'geekheros-edge';
const managedLabel = 'com.geekheros.managed=true';
const wordpressImage = process.env.GEEKHEROS_WORDPRESS_IMAGE || 'wordpress:latest';
const cliImage = process.env.GEEKHEROS_WPCLI_IMAGE || 'wordpress:cli';
const databaseImage = process.env.GEEKHEROS_DATABASE_IMAGE || 'mariadb:lts';
const edgeImage = process.env.GEEKHEROS_EDGE_IMAGE || 'traefik:v3';

if (!authToken || authToken.length < 24) {
  console.error('GEEKHEROS_AGENT_TOKEN must be set to a random value of at least 24 characters.');
  process.exit(1);
}

let stateQueue = Promise.resolve();

function emptyState() {
  return { version: 1, sites: {}, activity: [] };
}

async function readState() {
  await mkdir(stateDir, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(stateFile, 'utf8'));
    return { ...emptyState(), ...parsed, sites: parsed.sites || {}, activity: parsed.activity || [] };
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyState();
    throw error;
  }
}

async function writeState(state) {
  await mkdir(stateDir, { recursive: true });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, stateFile);
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
    const detail = String(error?.stderr || error?.stdout || error?.message || 'Docker command failed')
      .replace(/password[^\s]*/gi, 'password=[redacted]')
      .trim()
      .slice(0, 800);
    const wrapped = new Error(detail || 'Docker command failed');
    wrapped.code = error?.code;
    throw wrapped;
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

function validateSiteInput(input) {
  const name = String(input.name || '').trim();
  const domain = normalizeDomain(String(input.domain || ''));
  const adminUser = String(input.adminUser || '').trim();
  const adminEmail = String(input.adminEmail || '').trim().toLowerCase();
  const adminPassword = String(input.adminPassword || '');
  const pod = ['Micro', 'Standard', 'Performance', 'Power'].includes(input.pod) ? input.pod : 'Standard';
  if (!name || name.length > 80) throw new Error('Enter a site name up to 80 characters.');
  if (!domain || domain.length > 253 || !/^(?=.{1,253}$)(localhost|([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,62})$/.test(domain)) {
    throw new Error('Enter a valid hostname, such as client.example.com or client.localhost.');
  }
  if (!/^[A-Za-z0-9_.-]{1,60}$/.test(adminUser)) throw new Error('The admin username may contain letters, numbers, dots, dashes and underscores.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('Enter a valid administrator email address.');
  if (adminPassword.length < 12) throw new Error('Use an administrator password with at least 12 characters.');
  return { name, domain, adminUser, adminEmail, adminPassword, pod, region: 'Local Docker' };
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
    'run', '--rm', '--network', site.network, '--volumes-from', site.wpContainer,
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
    '-e', "WORDPRESS_CONFIG_EXTRA=define('FS_METHOD', 'direct'); define('DISALLOW_FILE_EDIT', true);",
    '-v', `${site.wpVolume}:/var/www/html`,
    wordpressImage,
  ], { timeout: 600_000 });
  await docker(['network', 'connect', edgeNetwork, site.wpContainer]);
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

async function refreshVersions(site) {
  let wpVersion = site.wpVersion || '—';
  let phpVersion = site.phpVersion || '—';
  let updates = Number(site.updates || 0);
  try { wpVersion = (await runWp(site, ['core', 'version'], { timeout: 60_000 })).stdout || wpVersion; } catch {}
  try { phpVersion = (await docker(['exec', site.wpContainer, 'php', '-r', 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;'], { timeout: 30_000 })).stdout || phpVersion; } catch {}
  try {
    const result = await runWp(site, ['eval', '$u=get_core_updates(); $p=get_plugin_updates(); $t=get_theme_updates(); echo count($u)+count($p)+count($t);'], { timeout: 120_000 });
    updates = Number(result.stdout) || 0;
  } catch {}
  await setSiteState(site.id, { wpVersion, phpVersion, updates, lastScannedAt: new Date().toISOString() });
}

async function provisionSite(siteId) {
  const state = await readState();
  const site = state.sites[siteId];
  if (!site) return;
  try {
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

    await setSiteState(siteId, { phase: null, status: 'Running', error: null, directPort, adminPassword: undefined });
    await refreshVersions({ ...site, directPort });
    await recordActivity({ siteId, siteName: site.name, type: 'provision', message: `${site.name} launched in Docker Desktop.` });
  } catch (error) {
    await setSiteState(siteId, { phase: null, status: 'Error', error: error.message || 'Provisioning failed.' });
    await recordActivity({ siteId, siteName: site.name, type: 'provision', state: 'failed', message: error.message || 'Provisioning failed.' });
  }
}

async function createSite(input) {
  const values = validateSiteInput(input);
  const state = await readState();
  if (Object.values(state.sites).some((site) => site.domain === values.domain)) throw new Error('That domain is already managed by GeekHeros.');
  const id = `site_${randomBytes(6).toString('hex')}`;
  const namespace = `gh-${slugify(values.domain)}-${id.slice(-4)}`;
  const site = {
    id, ...values, namespace,
    network: `${namespace}-net`, dbContainer: `${namespace}-db`, wpContainer: `${namespace}-wp`,
    dbVolume: `${namespace}-db`, wpVolume: `${namespace}-wp`,
    image: wordpressImage, status: 'Provisioning', phase: 'Queued', error: null,
    wpVersion: '—', phpVersion: '—', updates: 0, backups: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    secrets: { dbPassword: randomBytes(24).toString('base64url'), dbRootPassword: randomBytes(32).toString('base64url') },
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
  const status = site.phase ? 'Provisioning' : site.status === 'Error' ? 'Error' : dockerStatus === 'running' ? 'Running' : dockerStatus === 'exited' || dockerStatus === 'created' ? 'Stopped' : dockerStatus ? 'Attention' : site.status || 'Unknown';
  return {
    id: site.id, name: site.name, domain: site.domain, status, phase: site.phase || null, error: site.error || null,
    region: 'Local Docker', pod: site.pod, wp: site.wpVersion || '—', php: site.phpVersion || '—',
    updates: Number(site.updates || 0), uptime: status === 'Running' ? durationSince(inspect?.State?.StartedAt || site.createdAt) : '—',
    createdAt: site.createdAt, updatedAt: site.updatedAt, containerId: inspect?.Id?.slice(0, 12) || null,
    containerName: site.wpContainer, databaseContainer: site.dbContainer, image: site.image,
    directUrl: site.directPort ? `http://127.0.0.1:${site.directPort}` : null,
    siteUrl: `http://${site.domain}`, adminUrl: `http://${site.domain}/wp-admin/`,
    backupCount: site.backups?.length || 0, lastBackupAt: site.backups?.[0]?.createdAt || null,
    lastScannedAt: site.lastScannedAt || null,
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

async function createBackup(site) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const siteBackupDir = path.join(backupRoot, site.id);
  await mkdir(siteBackupDir, { recursive: true });
  const databaseFile = path.join(siteBackupDir, `${stamp}-database.sql`);
  const filesName = `${stamp}-wordpress.tar.gz`;
  await dockerToFile(['exec', '-e', `MYSQL_PWD=${site.secrets.dbRootPassword}`, site.dbContainer, 'mariadb-dump', '-uroot', 'wordpress'], databaseFile);
  await docker(['run', '--rm', '-v', `${site.wpVolume}:/source:ro`, '-v', `${siteBackupDir}:/backups`, 'alpine:latest', 'tar', '-czf', `/backups/${filesName}`, '-C', '/source', '.'], { timeout: 600_000 });
  const backup = { id: randomUUID(), createdAt: new Date().toISOString(), files: [path.basename(databaseFile), filesName] };
  await updateState((state) => { state.sites[site.id].backups.unshift(backup); });
  return backup;
}

async function runOperation(siteId, type, input = {}) {
  const site = await requireSite(siteId);
  const operation = String(type || '').replace(/^site\./, '');
  if (!['start', 'stop', 'restart', 'refresh', 'backup', 'update', 'scan', 'delete'].includes(operation)) {
    throw Object.assign(new Error('Unsupported operation.'), { status: 400 });
  }
  if (site.phase) throw Object.assign(new Error(`The site is currently ${site.phase.toLowerCase()}.`), { status: 409 });

  if (operation === 'delete') {
    await docker(['rm', '-f', site.wpContainer]).catch((error) => { if (!/No such/i.test(error.message)) throw error; });
    await docker(['rm', '-f', site.dbContainer]).catch((error) => { if (!/No such/i.test(error.message)) throw error; });
    await docker(['network', 'rm', site.network]).catch(() => undefined);
    if (input.deleteData === true) {
      await docker(['volume', 'rm', '-f', site.wpVolume]).catch(() => undefined);
      await docker(['volume', 'rm', '-f', site.dbVolume]).catch(() => undefined);
      await rm(path.join(backupRoot, site.id), { recursive: true, force: true });
    }
    await updateState((state) => { delete state.sites[site.id]; });
    await recordActivity({ siteId, siteName: site.name, type: operation, message: `${site.name} was removed${input.deleteData ? ' with its data' : '; volumes were preserved'}.` });
    return { deleted: true };
  }

  await setSiteState(site.id, { phase: `${operation[0].toUpperCase()}${operation.slice(1)} in progress`, error: null });
  try {
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
    } else if (operation === 'update') {
      await createBackup(site);
      await runWp(site, ['core', 'update'], { timeout: 600_000 });
      await runWp(site, ['plugin', 'update', '--all'], { timeout: 600_000 });
      await runWp(site, ['theme', 'update', '--all'], { timeout: 600_000 });
      await refreshVersions(site);
    } else if (operation === 'scan') {
      await runWp(site, ['core', 'verify-checksums'], { timeout: 300_000 });
      await runWp(site, ['plugin', 'verify-checksums', '--all', '--strict'], { timeout: 300_000 });
      await setSiteState(site.id, { lastScannedAt: new Date().toISOString() });
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

async function systemInfo() {
  const { stdout } = await docker(['info', '--format', '{{json .}}'], { timeout: 30_000 });
  const info = JSON.parse(stdout);
  const edge = await inspectContainer(edgeContainer);
  const sites = await listSites();
  return {
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
}

function tokenMatches(provided) {
  if (!provided) return false;
  const expectedHash = createHash('sha256').update(authToken).digest();
  const providedHash = createHash('sha256').update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
}

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  }
  if (!body) return {};
  try { return JSON.parse(body); } catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return send(response, 403, { error: 'Origin not allowed.' });
  if (!tokenMatches(request.headers['x-geekheros-token'])) return send(response, 401, { error: 'Agent authentication failed.' });
  try {
    const url = new URL(request.url || '/', `http://${host}:${port}`);
    if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, await systemInfo());
    if (request.method === 'GET' && url.pathname === '/sites') return send(response, 200, { sites: await listSites() });
    if (request.method === 'POST' && url.pathname === '/sites') return send(response, 202, { site: await createSite(await readJson(request)) });
    if (request.method === 'GET' && url.pathname === '/activity') {
      const state = await readState();
      return send(response, 200, { activity: state.activity });
    }
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
      if (site.phase || site.status === 'Provisioning') void provisionSite(site.id);
    }
  } catch (error) {
    console.error('Unable to resume pending sites:', error.message);
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
