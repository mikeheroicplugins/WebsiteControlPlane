import { env } from 'cloudflare:workers';

const bindings = env as unknown as { GEEKHEROS_AGENT_URL?: string; GEEKHEROS_AGENT_TOKEN?: string };

function agentConfig() {
  return {
    url: (bindings.GEEKHEROS_AGENT_URL || 'http://127.0.0.1:8788').replace(/\/$/, ''),
    token: bindings.GEEKHEROS_AGENT_TOKEN || '',
  };
}

export async function agentFetch(path: string, init: RequestInit = {}) {
  const agent = agentConfig();
  if (!agent.token) throw new Error('The GeekHeros service is not configured. Start the development service or check the hosting node configuration.');
  const headers = new Headers(init.headers);
  headers.set('x-geekheros-token', agent.token);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${agent.url}${path}`, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new Error('The GeekHeros hosting service is offline. Check the service on your hosting node.');
  }
  if (!response.ok) {
    const payload = await response.clone().json().catch(() => ({ error: 'The GeekHeros service returned an unreadable response.' })) as Record<string, unknown>;
    throw Object.assign(new Error(String(payload.error || 'GeekHeros service request failed.')), { status: response.status });
  }
  return response;
}

export async function agentRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  const response = await agentFetch(path, { ...init, headers });
  const payload = await response.json().catch(() => ({ error: 'The GeekHeros service returned an unreadable response.' })) as Record<string, unknown>;
  return payload;
}

export function agentError(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 503;
  return { status: Number.isFinite(status) ? status : 503, message: error instanceof Error ? error.message : 'GeekHeros service request failed.' };
}
