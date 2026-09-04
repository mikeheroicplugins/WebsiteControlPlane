import { NextRequest, NextResponse } from 'next/server';
import { agentError, agentRequest } from '@/app/api/_lib/agent';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get('mode');
    return NextResponse.json(await agentRequest(`/domains${mode ? `?mode=${encodeURIComponent(mode)}` : ''}`));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await agentRequest('/domains/call', { method: 'POST', body: JSON.stringify(await request.json()) }));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    return NextResponse.json(await agentRequest('/domains/settings', { method: 'PUT', body: JSON.stringify(await request.json()) }));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
