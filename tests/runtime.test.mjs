import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createWebServer } from '../server/web.mjs';
import { runtimeConfig } from '../agent/runtime-config.mjs';
import { agentPath } from '../shared/agent-path.mjs';
import { controlPlaneMcpToolCount } from '../agent/mcp.mjs';

const secret = () => randomBytes(32).toString('hex');
const listen = async (server) => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; };
const close = (server) => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });

test('browser routes map to the correct management endpoints', () => {
  for (const [url, method, expected] of [
    ['/api/system', 'GET', '/health'], ['/api/domains?mode=live', 'GET', '/domains?mode=live'],
    ['/api/domains', 'POST', '/domains/call'], ['/api/domains', 'PUT', '/domains/settings'],
    ['/api/lovable', 'POST', '/lovable/connect'], ['/api/lovable', 'DELETE', '/lovable'],
    ['/api/runtime', 'GET', '/runtime'], ['/api/sites/site_x/screenshot?v=1', 'GET', '/sites/site_x/screenshot?v=1'],
    ['/api/sites/site_x/backup-schedule', 'PATCH', '/sites/site_x/backup-schedule'],
  ]) assert.equal(agentPath(url, method), expected);
});

test('VPS configuration is explicit and fail-closed', () => {
  const env = { GEEKHEROS_DEPLOYMENT_MODE: 'vps', GEEKHEROS_DATA_DIR: path.join(tmpdir(), 'gh-test'), GEEKHEROS_PUBLIC_URL: 'https://control.example.com' };
  const vps = runtimeConfig(env);
  assert.equal(vps.edgeHttpPort, 8080);
  assert.equal(vps.scheme, 'https');
  assert.equal(vps.host, '127.0.0.1');
  assert.equal(runtimeConfig({}).edgeHttpPort, 80);
  for (const bad of [
    { GEEKHEROS_PUBLIC_URL: '' }, { GEEKHEROS_PUBLIC_URL: 'http://control.example.com' },
    { GEEKHEROS_PUBLIC_URL: 'https://user:pass@control.example.com' }, { GEEKHEROS_PUBLIC_URL: 'https://control.example.com/path' },
    { GEEKHEROS_AGENT_HOST: '0.0.0.0' }, { GEEKHEROS_AGENT_PORT: 'NaN' },
    { GEEKHEROS_DATA_DIR: 'relative' }, { GEEKHEROS_DEPLOYMENT_MODE: 'unknown' },
  ]) assert.throws(() => runtimeConfig({ ...env, ...bad }));
});

test('gateway protects dashboard, API and static files; preserves method, data and trusted telemetry', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'geekheros-gateway-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>geekheros.com</title>');
  await writeFile(path.join(directory, '.env'), 'must never be served');
  await mkdir(path.join(directory, 'assets'));
  await writeFile(path.join(directory, 'assets', 'app.js'), 'console.log("test")');
  const agentToken = secret(), webToken = secret(), publicUrl = 'https://control.example.com';
  const requests = [];
  const upstream = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, method: req.method, body, headers: req.headers });
    if (req.url === '/mcp' && req.headers.authorization !== 'Bearer mcp-test') { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'test-session', 'set-cookie': 'must-not-leak=1' });
    res.end(JSON.stringify({ ok: true }));
  });
  const agentUrl = await listen(upstream);
  t.after(() => close(upstream));
  const gateway = createWebServer({ publicUrl, agentUrl, agentToken, webToken, staticDir: directory });
  const url = await listen(gateway);
  t.after(() => close(gateway));
  const headers = { 'x-geekheros-web-token': webToken };
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url + '/api/system')).status, 401);
  assert.equal((await fetch(url + '/api/system', { headers: { 'x-geekheros-web-token': 'wrong' } })).status, 401);
  const home = await fetch(url, { headers });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /geekheros.com/);
  assert.equal(home.headers.get('x-frame-options'), 'DENY');
  assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  for (const pathname of ['/.env', '/%2eenv', '/missing.js', '/%5c..%5c.env', '/agent/server.mjs']) assert.equal((await fetch(url + pathname, { headers })).status, 404);
  assert.equal((await fetch(url + '/assets/app.js', { headers, method: 'HEAD' })).status, 200);
  const start = requests.length;
  assert.equal((await fetch(url + '/api/domains', { headers, method: 'POST', body: '{}' })).status, 403);
  assert.equal((await fetch(url + '/api/domains', { headers: { ...headers, origin: 'https://evil.example' }, method: 'POST', body: '{}' })).status, 403);
  assert.equal(requests.length, start);
  const result = await fetch(url + '/api/domains', { method: 'POST', headers: { ...headers, origin: publicUrl, authorization: 'Basic should-not-forward', cookie: 'should-not-forward=1', 'content-type': 'application/json', 'x-geekheros-client-ip': '203.0.113.42' }, body: '{"operation":"test"}' });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('set-cookie'), null);
  assert.equal(requests.at(-1).path, '/domains/call');
  assert.equal(requests.at(-1).body, '{"operation":"test"}');
  assert.equal(requests.at(-1).headers['x-geekheros-token'], agentToken);
  assert.equal(requests.at(-1).headers['x-geekheros-client-ip'], '203.0.113.42');
  assert.equal(requests.at(-1).headers.cookie, undefined);
  assert.equal(requests.at(-1).headers.authorization, undefined);
  assert.equal(requests.at(-1).headers['x-geekheros-web-token'], undefined);
  assert.equal((await fetch(url + '/mcp', { headers })).status, 401);
  const mcp = await fetch(url + '/mcp', { method: 'POST', headers: { ...headers, authorization: 'Bearer mcp-test' }, body: '{}' });
  assert.equal(mcp.status, 200);
  assert.equal(mcp.headers.get('mcp-session-id'), 'test-session');
  assert.equal((await fetch(url + '/lovable/oauth/callback?state=test', { headers })).status, 200);
  await close(upstream);
  assert.equal((await fetch(url + '/api/runtime', { headers })).status, 502);
});

test('actual MCP requires authentication, discovers 58 tools and serves VPS readiness through gateway', { timeout: 30_000 }, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'geekheros-mcp-test-'));
  let child, gateway, client;
  t.after(async () => {
    await client?.close();
    if (gateway) await close(gateway);
    if (child?.exitCode === null) { child.kill(); await once(child, 'exit'); }
    await rm(directory, { recursive: true, force: true });
  });
  const reserved = createServer(); const agentUrl = await listen(reserved); await close(reserved);
  const agentToken = secret(), webToken = secret(), mcpToken = secret();
  // Isolated fixture: no real sites, provider credentials, or billable operations.
  await writeFile(path.join(directory, 'state.json'), JSON.stringify({ sites: {}, clients: {}, blueprints: {}, agents: {}, activity: [], integrations: { mcp: { token: mcpToken } } }));
  child = spawn(process.execPath, ['agent/server.mjs'], { cwd: process.cwd(), env: { ...process.env, DOCKER_HOST: 'tcp://127.0.0.1:1', DOCKER_CONTEXT: '', GEEKHEROS_DEPLOYMENT_MODE: 'vps', GEEKHEROS_DATA_DIR: directory, GEEKHEROS_PUBLIC_URL: 'https://control.example.com', GEEKHEROS_AGENT_HOST: '127.0.0.1', GEEKHEROS_AGENT_PORT: new URL(agentUrl).port, GEEKHEROS_AGENT_TOKEN: agentToken }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = ''; child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated agent did not start: ' + logs)), 15_000);
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('management service listening')) { clearTimeout(timer); resolve(); } });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
  });
  assert.equal((await fetch(agentUrl + '/runtime', { headers: { origin: 'https://geekheros-control-plane.heroiccrm.chatgpt.site' } })).status, 403);
  assert.equal((await fetch(agentUrl + '/runtime')).status, 401);
  assert.equal((await fetch(agentUrl + '/mcp')).status, 401);
  // Fetch the isolated MCP token through the state shape used by the running agent.
  const { readFile } = await import('node:fs/promises');
  const state = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
  const actualToken = state.integrations.mcp.token;
  gateway = createWebServer({ publicUrl: 'https://control.example.com', agentUrl, agentToken, webToken, staticDir: directory });
  const url = await listen(gateway);
  client = new Client({ name: 'geekheros-runtime-test', version: '1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url + '/mcp'), { requestInit: { headers: { authorization: `Bearer ${actualToken}`, 'x-geekheros-web-token': webToken, 'x-geekheros-client-ip': '203.0.113.99' } } });
  await client.connect(transport);
  const discovery = await client.listTools();
  assert.equal(discovery.tools.length, controlPlaneMcpToolCount);
  assert.equal(controlPlaneMcpToolCount, 58);
  assert.ok(discovery.tools.some((tool) => tool.name === 'get_runtime_diagnostics'));
  const result = await client.callTool({ name: 'get_runtime_diagnostics', arguments: {} });
  assert.ok(!result.isError);
  const diagnostics = JSON.parse(result.content.find((part) => part.type === 'text').text);
  assert.equal(diagnostics.deploymentMode, 'vps');
  assert.equal(diagnostics.publicUrl, 'https://control.example.com');
  assert.equal(diagnostics.desktopRequired, false);
  assert.equal(diagnostics.storage.available, true);
  assert.ok(!JSON.stringify(result).includes(agentToken));
  assert.ok(!JSON.stringify(result).includes(actualToken));
  const info = await client.callTool({ name: 'get_system_info', arguments: {} });
  assert.ok(!info.isError);
  assert.equal(JSON.parse(info.content.find((part) => part.type === 'text').text).connected, false);
  const health = await fetch(url + '/api/system', { headers: { 'x-geekheros-web-token': webToken } });
  const healthJson = await health.json();
  assert.equal(health.status, 200);
  assert.equal(healthJson.mcp.url, 'https://control.example.com/mcp');
  assert.equal(healthJson.runtime.deploymentMode, 'vps');
  const agents = await fetch(url + '/api/agents', { headers: { 'x-geekheros-web-token': webToken } });
  assert.ok((await agents.json()).agents.some((agent) => agent.ip === '203.0.113.99'));
});
