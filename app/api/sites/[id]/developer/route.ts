import { NextRequest, NextResponse } from 'next/server';
import { agentError, agentRequest } from '@/app/api/_lib/agent';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const incoming = request.nextUrl.searchParams;
    const outgoing = new URLSearchParams();
    for (const key of ['tool', 'lines', 'limit', 'path']) {
      const value = incoming.get(key);
      if (value !== null) outgoing.set(key, value);
    }
    return NextResponse.json(await agentRequest(`/sites/${encodeURIComponent(id)}/developer?${outgoing.toString()}`));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    return NextResponse.json(await agentRequest(`/sites/${encodeURIComponent(id)}/developer`, { method: 'POST', body: JSON.stringify(body) }));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
