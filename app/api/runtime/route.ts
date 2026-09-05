import { NextResponse } from 'next/server';
import { agentError, agentRequest } from '../_lib/agent';

export async function GET() {
  try { return NextResponse.json(await agentRequest('/runtime')); }
  catch (error) { const failure = agentError(error); return NextResponse.json({ error: failure.message }, { status: failure.status }); }
}
