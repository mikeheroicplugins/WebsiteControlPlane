import { NextRequest, NextResponse } from 'next/server';
import { agentError, agentRequest } from '@/app/api/_lib/agent';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    return NextResponse.json(await agentRequest(`/staging/${encodeURIComponent(id)}/actions`, { method: 'POST', body: JSON.stringify(body) }));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
