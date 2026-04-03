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
    const { agentId, status } = body as {
      agentId?: string;
      status?: string;
    };

    if (!agentId || typeof agentId !== 'string') {
      return jsonError('agentId is required', 400);
    }

    const doc = await getDocumentBySlug(slug);
    if (!doc) {
      return jsonError('Document not found', 404);
    }

    // TODO: Store agent presence in a transient store (Redis, in-memory, etc.)
    // For now this is a REST fallback; real presence goes through WebSocket.

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/bridge/:slug/presence] Error:', err);
    return jsonError('Internal server error', 500);
  }
}
