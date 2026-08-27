import { NextRequest, NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { queueSiteOperation } from '@/db/repository';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const owner = user?.userId ?? (process.env.NODE_ENV === 'development' ? 'local-preview' : null);
  if (!owner) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json() as { type?: string };
  const allowed = new Set(['site.refresh', 'site.start', 'site.stop', 'site.restart', 'site.backup', 'site.update']);
  if (!body.type || !allowed.has(body.type)) return NextResponse.json({ error: 'Unsupported operation' }, { status: 400 });
  return NextResponse.json({ operation: await queueSiteOperation(owner, id, body.type) }, { status: 202 });
}
