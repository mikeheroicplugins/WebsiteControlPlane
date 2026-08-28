import { NextResponse } from 'next/server';
import { agentError, agentRequest } from '@/app/api/_lib/agent';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const refresh = new URL(request.url).searchParams.get('refresh') === '1' ? '?refresh=1' : '';
    return NextResponse.json(await agentRequest(`/sites/${encodeURIComponent(id)}/monitoring${refresh}`));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
