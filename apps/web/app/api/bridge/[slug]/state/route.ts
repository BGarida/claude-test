import { NextRequest } from 'next/server';
import { getDocumentBySlug, resolveDocumentAccess } from '@proof-clone/db';
import { getBridgeToken, hashSecret, jsonError } from '../../../../../lib/api-utils';

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

    return Response.json({
      slug: doc.slug,
      title: doc.title,
      markdown: doc.markdown,
      marks: doc.marks,
      revision: doc.revision,
    });
  } catch (err) {
    console.error('[GET /api/bridge/:slug/state] Error:', err);
    return jsonError('Internal server error', 500);
  }
}
