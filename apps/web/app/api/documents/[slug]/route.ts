import { NextRequest } from 'next/server';
import { getDocumentBySlug } from '@proof-clone/db';
import { jsonError } from '../../../../lib/api-utils';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const doc = await getDocumentBySlug(slug);
    if (!doc) {
      return jsonError('Document not found', 404);
    }

    return Response.json({
      slug: doc.slug,
      docId: doc.doc_id,
      title: doc.title,
      shareState: doc.share_state,
      revision: doc.revision,
      active: doc.active,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    });
  } catch (err) {
    console.error(`[GET /api/documents/${(await params).slug}] Error:`, err);
    return jsonError('Internal server error', 500);
  }
}
