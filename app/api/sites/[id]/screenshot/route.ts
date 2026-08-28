import { NextResponse } from 'next/server';
import { agentError, agentFetch, agentRequest } from '@/app/api/_lib/agent';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const response = await agentFetch(`/sites/${encodeURIComponent(id)}/screenshot`, { headers: { accept: 'image/png' } });
    const headers = new Headers();
    headers.set('content-type', 'image/png');
    headers.set('cache-control', 'private, no-cache, must-revalidate');
    const capturedAt = response.headers.get('x-geekheros-captured-at');
    if (capturedAt) headers.set('x-geekheros-captured-at', capturedAt);
    return new Response(await response.arrayBuffer(), { status: 200, headers });
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await agentRequest(`/sites/${encodeURIComponent(id)}/screenshot`, { method: 'POST' }));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
