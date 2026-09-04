import { NextRequest, NextResponse } from 'next/server';
import { agentError, agentRequest } from '@/app/api/_lib/agent';

export async function GET(request: NextRequest) {
  try {
    const outgoing = new URLSearchParams();
    for (const key of ['rangeDays', 'siteId', 'environment', 'kind']) {
      const value = request.nextUrl.searchParams.get(key);
      if (value !== null) outgoing.set(key, value);
    }
    return NextResponse.json(await agentRequest(`/analytics?${outgoing.toString()}`));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
