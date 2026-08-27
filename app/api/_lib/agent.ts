import { env } from 'cloudflare:workers';

const bindings = env as unknown as { GEEKHEROS_AGENT_URL?: string; GEEKHEROS_AGENT_TOKEN?: string };

function agentConfig() {
  return {
    url: (bindings.GEEKHEROS_AGENT_URL || 'http://127.0.0.1:8788').replace(/\/$/, ''),
    token: bindings.GEEKHEROS_AGENT_TOKEN || '',
  };
}

export async function agentRequest(path: string, init: RequestInit = {}) {
  const agent = agentConfig();
  if (!agent.token) throw new Error('The local Docker agent is not configured. Start the app with npm run dev.');
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set('x-geekheros-token', agent.token);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${agent.url}${path}`, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new Error('Docker Desktop agent is offline. Start the app with npm run dev and keep Docker Desktop running.');
  }
  const payload = await response.json().catch(() => ({ error: 'The Docker agent returned an unreadable response.' })) as Record<string, unknown>;
  if (!response.ok) throw Object.assign(new Error(String(payload.error || 'Docker agent request failed.')), { status: response.status });
  return payload;
}

export function agentError(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 503;
  return { status: Number.isFinite(status) ? status : 503, message: error instanceof Error ? error.message : 'Docker agent request failed.' };
}
