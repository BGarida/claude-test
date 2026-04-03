import { NextRequest } from 'next/server';
import { getDocumentBySlug, resolveDocumentAccess } from '@proof-clone/db';
import { getAuthToken, hashSecret, jsonError } from '../../../../../lib/api-utils';

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

    // Validate access if document has owner secret (i.e. is access-controlled)
    if (doc.owner_secret_hash) {
      const token = getAuthToken(request);
      if (!token) {
        return jsonError('Authentication required', 401);
      }
      const tokenHash = hashSecret(token);
      const access = await resolveDocumentAccess(slug, tokenHash);
      if (!access) {
        return jsonError('Invalid or expired access token', 403);
      }
    }

    return Response.json({
      slug: doc.slug,
      title: doc.title,
      markdown: doc.markdown,
      marks: doc.marks,
      revision: doc.revision,
      shareState: doc.share_state,
    });
  } catch (err) {
    console.error('[GET /api/documents/:slug/state] Error:', err);
    return jsonError('Internal server error', 500);
  }
}
