import { createServer, request as httpRequest } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentPath } from '../shared/agent-path.mjs';
import { runtimeConfig } from '../agent/runtime-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const loopback = (address) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

export function createWebServer({ publicUrl, agentUrl, agentToken, webToken, staticDir = path.join(root, 'dist-vps') }) {
  if (!agentToken || agentToken.length < 24 || !webToken || webToken.length < 32 || webToken === agentToken) throw new Error('Set separate, strong GEEKHEROS_AGENT_TOKEN and GEEKHEROS_WEB_TOKEN secrets.');
  const upstream = new URL(agentUrl);
  if (upstream.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(upstream.hostname) || upstream.username || upstream.password) throw new Error('The agent upstream must be a loopback HTTP address.');
  const canonicalOrigin = new URL(publicUrl).origin;
  const reply = (response, status, error) => {
    if (response.headersSent) return response.destroy();
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ error }));
  };
  const server = createServer(async (request, response) => {
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('cache-control', 'no-store');
    try {
      // Caddy authenticates administrators and overwrites this header. The agent
      // has a different secret, so neither browser credentials nor this token can call it directly.
      if (!loopback(request.socket.remoteAddress) || !safeEqual(webToken, request.headers['x-geekheros-web-token'])) return reply(response, 401, 'Sign in through the geekheros.com HTTPS gateway.');
      const url = new URL(request.url, canonicalOrigin);
      const isMcp = url.pathname === '/mcp';
      const callback = url.pathname === '/lovable/oauth/callback' && request.method === 'GET';
      const isApi = url.pathname.startsWith('/api/');
      if (isApi || isMcp || callback) {
        if (!isMcp && !callback) {
          const origin = request.headers.origin;
          if ((origin && origin !== canonicalOrigin) || (!['GET', 'HEAD'].includes(request.method) && origin !== canonicalOrigin)) return reply(response, 403, 'This request must originate from the signed-in dashboard.');
          if (request.headers['sec-fetch-site'] === 'cross-site') return reply(response, 403, 'Cross-site requests are not allowed.');
        }
        if (isMcp && request.headers.origin && request.headers.origin !== canonicalOrigin) return reply(response, 403, 'MCP origin not allowed.');
        if (Number(request.headers['content-length'] || 0) > 105_000_000) return reply(response, 413, 'Request body is too large.');
        const headers = { 'x-geekheros-token': agentToken, 'x-geekheros-client-ip': request.headers['x-geekheros-client-ip'] || request.socket.remoteAddress };
        for (const key of ['accept', 'content-type', 'user-agent', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id']) if (request.headers[key]) headers[key] = request.headers[key];
        if (isMcp && request.headers.authorization) headers.authorization = request.headers.authorization;
        const proxy = httpRequest(new URL(isApi ? agentPath(url.pathname + url.search, request.method) : url.pathname + url.search, upstream), { method: request.method, headers }, (incoming) => {
          response.statusCode = incoming.statusCode || 502;
          for (const key of ['content-type', 'content-length', 'mcp-session-id', 'www-authenticate', 'x-geekheros-captured-at']) if (incoming.headers[key]) response.setHeader(key, incoming.headers[key]);
          pipeline(incoming, response).catch(() => response.destroy());
        });
        // Never retry state-changing requests: a lost response may follow a completed purchase or restore.
        proxy.setTimeout(900_000, () => proxy.destroy(new Error('Upstream timeout')));
        proxy.on('error', () => reply(response, 502, 'The GeekHeros service is temporarily unavailable. Check service health before retrying an operation.'));
        response.on('close', () => proxy.destroy());
        let received = 0;
        const limit = new Transform({ transform(chunk, encoding, done) {
          received += chunk.length;
          if (received > 105_000_000) { reply(response, 413, 'Request body is too large.'); done(new Error('Body limit')); }
          else done(null, chunk);
        } });
        pipeline(request, limit, proxy).catch(() => proxy.destroy());
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) return reply(response, 405, 'Method not allowed.');
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some((part) => part.startsWith('.'))) return reply(response, 404, 'Not found.');
      const directory = await realpath(staticDir);
      let filename = path.resolve(directory, `.${decoded === '/' ? '/index.html' : decoded}`);
      if (!filename.startsWith(directory + path.sep)) return reply(response, 404, 'Not found.');
      let info;
      try { filename = await realpath(filename); info = await stat(filename); } catch { return reply(response, 404, 'Not found.'); }
      if (!filename.startsWith(directory + path.sep) || !info.isFile() || !types[path.extname(filename)]) return reply(response, 404, 'Not found.');
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action https:");
      response.setHeader('content-type', types[path.extname(filename)]);
      response.setHeader('content-length', info.size);
      if (url.pathname.startsWith('/assets/')) response.setHeader('cache-control', 'private, max-age=31536000, immutable');
      if (request.method === 'HEAD') return response.end();
      await pipeline(createReadStream(filename), response);
    } catch {
      reply(response, 500, 'The GeekHeros dashboard could not serve this request.');
    }
  });
  server.requestTimeout = 900_000;
  server.headersTimeout = 20_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = runtimeConfig(process.env, root);
  const server = createWebServer({ publicUrl: config.publicUrl, agentUrl: `http://${config.host === '::1' ? '[::1]' : config.host}:${config.port}`, agentToken: process.env.GEEKHEROS_AGENT_TOKEN, webToken: process.env.GEEKHEROS_WEB_TOKEN });
  server.listen(config.webPort, '127.0.0.1', () => console.log(`geekheros.com gateway listening on http://127.0.0.1:${config.webPort}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10_000).unref(); });
}
