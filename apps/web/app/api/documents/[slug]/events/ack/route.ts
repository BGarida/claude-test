import { NextRequest } from 'next/server';
import { ackDocumentEvents, getDocumentBySlug } from '@proof-clone/db';
import { jsonError } from '../../../../../../lib/api-utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { upToId, by } = body as { upToId?: number; by?: string };

    if (typeof upToId !== 'number') {
      return jsonError('upToId is required and must be a number', 400);
    }

    const doc = await getDocumentBySlug(slug);
    if (!doc) {
      return jsonError('Document not found', 404);
    }

    const ackedBy = by || 'api';
    const count = await ackDocumentEvents(slug, upToId, ackedBy);

    return Response.json({ acknowledged: count });
  } catch (err) {
    console.error('[POST /api/documents/:slug/events/ack] Error:', err);
    return jsonError('Internal server error', 500);
  }
}
