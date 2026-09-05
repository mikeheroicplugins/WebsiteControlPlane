import path from 'node:path';
import os from 'node:os';

export function runtimeConfig(env = process.env, root = process.cwd()) {
  const mode = env.GEEKHEROS_DEPLOYMENT_MODE || 'local';
  if (!['local', 'vps'].includes(mode)) throw new Error('GEEKHEROS_DEPLOYMENT_MODE must be local or vps.');
  const isVps = mode === 'vps';
  const host = env.GEEKHEROS_AGENT_HOST || '127.0.0.1';
  if (!['127.0.0.1', '::1'].includes(host)) throw new Error('The management agent must bind to loopback. Use the authenticated HTTPS gateway for remote access.');
  const number = (key, fallback) => {
    const value = Number(env[key] || fallback);
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${key} must be a valid port.`);
    return value;
  };
  let publicUrl = null;
  if (env.GEEKHEROS_PUBLIC_URL) {
    const url = new URL(env.GEEKHEROS_PUBLIC_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('GEEKHEROS_PUBLIC_URL must be an HTTPS origin without a path or credentials.');
    }
    publicUrl = url.origin;
  }
  if (isVps && !publicUrl) throw new Error('Set GEEKHEROS_PUBLIC_URL before starting the VPS service.');
  if (isVps && (!env.GEEKHEROS_DATA_DIR || !path.isAbsolute(env.GEEKHEROS_DATA_DIR))) throw new Error('VPS mode requires an absolute GEEKHEROS_DATA_DIR for persistent data.');
  const scheme = env.GEEKHEROS_SITE_SCHEME || (isVps ? 'https' : 'http');
  if (!['http', 'https'].includes(scheme)) throw new Error('GEEKHEROS_SITE_SCHEME must be http or https.');
  return {
    mode, isVps, host, publicUrl, scheme,
    port: number('GEEKHEROS_AGENT_PORT', 8788),
    webPort: number('GEEKHEROS_WEB_PORT', 3080),
    dataDir: path.resolve(env.GEEKHEROS_DATA_DIR || path.join(root, '.geekheros')),
    nodeName: env.GEEKHEROS_NODE_NAME || (isVps ? os.hostname() : 'Development node'),
    edgeHttpPort: number('GEEKHEROS_EDGE_HTTP_PORT', isVps ? 8080 : 80),
    edgeHttpsPort: number('GEEKHEROS_EDGE_HTTPS_PORT', isVps ? 8443 : 443),
  };
}
