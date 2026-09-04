import { type NextRequest, NextResponse } from 'next/server';
import { agentError, agentRequest } from '@/app/api/_lib/agent';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await agentRequest('/wordpress/plugins/library'));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ plugins: [], error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json(await agentRequest('/wordpress/plugins/library', { method: 'POST', body: JSON.stringify(body) }));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
