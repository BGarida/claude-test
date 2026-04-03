import { NextRequest } from 'next/server';
import {
  getDocumentBySlug,
  bumpDocumentRevision,
  addDocumentEvent,
  resolveDocumentAccess,
} from '@proof-clone/db';
import { getBridgeToken, hashSecret, jsonError } from '../../../../../lib/api-utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const doc = await getDocumentBySlug(slug);
    if (!doc) {
      return jsonError('Document not found', 404);
    }

    // Validate bridge token
    if (doc.owner_secret_hash) {
      const token = getBridgeToken(request);
      if (!token) {
        return jsonError('Missing or invalid bridge token', 401);
      }
      const tokenHash = hashSecret(token);
      const access = await resolveDocumentAccess(slug, tokenHash);
      if (!access) {
        return jsonError('Invalid or expired bridge token', 403);
      }
    }

    const body = await request.json();
    const { markdown, by } = body as { markdown?: string; by?: string };

    if (!markdown || typeof markdown !== 'string') {
      return jsonError('markdown is required', 400);
    }

    const actor = by || 'bridge';

    // TODO: Check for live collab clients and potentially block the rewrite
    // to avoid conflicts. For now we proceed unconditionally.

    const { newRevision } = await bumpDocumentRevision(
      slug,
      markdown,
      doc.marks as Record<string, unknown>,
    );

    await addDocumentEvent(
      slug,
      'rewrite.applied',
      { by: actor },
      actor,
      { documentRevision: newRevision },
    );

    return Response.json({ revision: newRevision, markdown });
  } catch (err) {
    console.error('[POST /api/bridge/:slug/rewrite] Error:', err);
    return jsonError('Internal server error', 500);
  }
}
