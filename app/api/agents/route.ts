import { NextResponse } from 'next/server';
import { agentError, agentRequest } from '@/app/api/_lib/agent';

export async function GET() {
  try {
    return NextResponse.json(await agentRequest('/agents'));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ agents: [], error: failure.message }, { status: failure.status });
  }
}
