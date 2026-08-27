import { NextRequest, NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { createSite, listSites } from '@/db/repository';

async function ownerId() {
  const user = await getChatGPTUser();
  if (user) return user.userId;
  if (process.env.NODE_ENV === 'development') return 'local-preview';
  return null;
}

export async function GET() {
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  return NextResponse.json({ sites: await listSites(owner) });
}

export async function POST(request: NextRequest) {
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json() as { name?: string; domain?: string; region?: string; pod?: string };
  if (!body.name?.trim() || !body.domain?.trim()) return NextResponse.json({ error: 'Name and domain are required' }, { status: 400 });
  try {
    const site = await createSite(owner, {
      name: body.name.trim(),
      domain: body.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''),
      region: body.region || 'US West',
      pod: body.pod || 'Standard',
    });
    return NextResponse.json({ site }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes('UNIQUE') ? 'That domain is already connected.' : 'Unable to create site.';
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
