import { NextRequest } from 'next/server';
import { listDocumentEvents, getDocumentBySlug } from '@proof-clone/db';
import { jsonError } from '../../../../../../lib/api-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const doc = await getDocumentBySlug(slug);
    if (!doc) {
      return jsonError('Document not found', 404);
    }

    const url = new URL(request.url);
    const afterParam = url.searchParams.get('after');
    const limitParam = url.searchParams.get('limit');

    const after = afterParam ? parseInt(afterParam, 10) : undefined;
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 1000) : 100;

    const events = await listDocumentEvents(slug, after, limit);

    return Response.json({ events });
  } catch (err) {
    console.error('[GET /api/documents/:slug/events/pending] Error:', err);
    return jsonError('Internal server error', 500);
  }
}
