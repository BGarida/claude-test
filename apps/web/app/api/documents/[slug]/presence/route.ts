import { NextRequest } from 'next/server';
import { getDocumentBySlug } from '@proof-clone/db';
import { jsonError } from '../../../../../lib/api-utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { actor, status, cursor } = body as {
      actor?: string;
      status?: string;
      cursor?: unknown;
    };

    if (!actor || typeof actor !== 'string') {
      return jsonError('actor is required', 400);
    }

    const doc = await getDocumentBySlug(slug);
    if (!doc) {
      return jsonError('Document not found', 404);
    }

    // TODO: Store presence in a transient store (Redis, in-memory, etc.)
    // For now this is a REST fallback; real presence goes through WebSocket.
    // We validate the document exists but don't persist — presence is ephemeral.

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/documents/:slug/presence] Error:', err);
    return jsonError('Internal server error', 500);
  }
}
