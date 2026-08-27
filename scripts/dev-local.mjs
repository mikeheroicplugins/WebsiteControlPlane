import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = randomBytes(32).toString('base64url');
const env = {
  ...process.env,
  GEEKHEROS_AGENT_URL: 'http://127.0.0.1:8788',
  GEEKHEROS_AGENT_TOKEN: token,
};
const children = [
  spawn(process.execPath, ['--watch', '--watch-preserve-output', 'agent/server.mjs'], { cwd: projectRoot, env, stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev'], { cwd: projectRoot, env, stdio: 'inherit', windowsHide: true }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 250).unref();
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!stopping && code !== 0) {
      console.error(`A local service stopped unexpectedly (${signal || code}).`);
      stop(code || 1);
    }
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
