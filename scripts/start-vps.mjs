import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeConfig } from '../agent/runtime-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.GEEKHEROS_ENV_FILE) process.loadEnvFile(process.env.GEEKHEROS_ENV_FILE);
const env = { ...process.env, NODE_ENV: 'production', GEEKHEROS_DEPLOYMENT_MODE: 'vps' };
runtimeConfig(env, root);
if (!env.GEEKHEROS_AGENT_TOKEN || env.GEEKHEROS_AGENT_TOKEN.length < 24 || !env.GEEKHEROS_WEB_TOKEN || env.GEEKHEROS_WEB_TOKEN.length < 32 || env.GEEKHEROS_AGENT_TOKEN === env.GEEKHEROS_WEB_TOKEN) throw new Error('Configure two distinct, strong agent and gateway secrets before starting.');
await access(path.join(root, 'dist-vps', 'index.html'));
const children = ['agent/server.mjs', 'server/web.mjs'].map((script) => spawn(process.execPath, [script], { cwd: root, env, stdio: 'inherit', windowsHide: true }));
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => { for (const child of children) if (child.exitCode === null) child.kill('SIGKILL'); }, 170_000).unref();
}
for (const child of children) {
  child.on('error', () => { console.error('A GeekHeros service could not start.'); stop(1); });
  child.on('exit', () => { if (!stopping) { console.error('A GeekHeros service stopped. The service manager will restart the control plane.'); stop(1); } });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
