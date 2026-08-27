import { type NextRequest, NextResponse } from 'next/server';
import { agentError, agentRequest } from '@/app/api/_lib/agent';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await agentRequest('/blueprints'));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ blueprints: [], error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json(await agentRequest('/blueprints', { method: 'POST', body: JSON.stringify(body) }), { status: 201 });
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
