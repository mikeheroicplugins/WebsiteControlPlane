import { type NextRequest, NextResponse } from 'next/server';
import { agentError, agentRequest } from '@/app/api/_lib/agent';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const source = new URL(request.url);
    const query = new URLSearchParams();
    for (const key of ['query', 'page', 'perPage']) {
      const value = source.searchParams.get(key);
      if (value) query.set(key, value);
    }
    return NextResponse.json(await agentRequest(`/wordpress/plugins?${query.toString()}`));
  } catch (error) {
    const failure = agentError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
