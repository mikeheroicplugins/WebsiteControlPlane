import { NextResponse } from 'next/server';
import { agentError, agentRequest } from '@/app/api/_lib/agent';

export const dynamic = 'force-dynamic';

async function respond(path: string, init?: RequestInit) {
  try {
    return NextResponse.json(await agentRequest(path, init));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function GET() {
  return respond('/lovable');
}

export async function POST() {
  return respond('/lovable/connect', { method: 'POST' });
}

export async function DELETE() {
  return respond('/lovable', { method: 'DELETE' });
}
