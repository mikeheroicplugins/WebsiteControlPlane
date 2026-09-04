import { NextRequest, NextResponse } from 'next/server';
import { agentError, agentRequest } from '@/app/api/_lib/agent';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await agentRequest(`/sites/${encodeURIComponent(id)}/backup-schedule`));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await agentRequest(`/sites/${encodeURIComponent(id)}/backup-schedule`, { method: 'PATCH', body: JSON.stringify(await request.json()) }));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
