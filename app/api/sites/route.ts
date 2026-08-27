import { NextRequest, NextResponse } from 'next/server';
import { agentError, agentRequest } from '@/app/api/_lib/agent';

export async function GET() {
  try {
    return NextResponse.json(await agentRequest('/sites'));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ sites: [], error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json(await agentRequest('/sites', { method: 'POST', body: JSON.stringify(body) }), { status: 202 });
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
