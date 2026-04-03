import { NextRequest } from 'next/server';
import {
  getDocumentBySlug,
  updateDocumentByRevision,
  getStoredIdempotencyResult,
  storeIdempotencyResult,
  addDocumentEvent,
} from '@proof-clone/db';
import {
  getIdempotencyKey,
  hashRequestBody,
  jsonError,
} from '../../../../../../lib/api-utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { operations, baseRevision } = body as {
      operations?: Array<{
        type: string;
        content?: string;
        position?: number;
        from?: number;
        to?: number;
        length?: number;
      }>;
      baseRevision?: number;
    };

    if (!operations || !Array.isArray(operations)) {
      return jsonError('operations array is required', 400);
    }
    if (typeof baseRevision !== 'number') {
      return jsonError('baseRevision is required and must be a number', 400);
    }

    // Idempotency check
    const idempotencyKey = getIdempotencyKey(request);
    const route = 'edit/v2';
    if (idempotencyKey) {
      const stored = await getStoredIdempotencyResult(idempotencyKey, slug, route);
      if (stored) {
        return Response.json(stored.responseJson, { status: stored.statusCode });
      }
    }

    const doc = await getDocumentBySlug(slug);
    if (!doc) {
      return jsonError('Document not found', 404);
    }

    // Apply operations to the markdown
    let markdown = doc.markdown;
    for (const op of operations) {
      switch (op.type) {
        case 'insert':
          if (typeof op.content === 'string' && typeof op.position === 'number') {
            markdown =
              markdown.slice(0, op.position) +
              op.content +
              markdown.slice(op.position);
          }
          break;
        case 'delete':
          if (typeof op.position === 'number' && typeof op.length === 'number') {
            markdown =
              markdown.slice(0, op.position) +
              markdown.slice(op.position + op.length);
          }
          break;
        case 'replace': {
          if (typeof op.content === 'string') {
            const from = op.from ?? op.position ?? 0;
            const to = op.to ?? from;
            markdown =
              markdown.slice(0, from) + op.content + markdown.slice(to);
          }
          break;
        }
        default:
          break;
      }
    }

    const result = await updateDocumentByRevision(
      slug,
      baseRevision,
      markdown,
      doc.marks,
    );

    if (!result.success) {
      const conflictResponse = {
        error: 'Revision conflict',
        code: 'REVISION_CONFLICT',
        currentRevision: result.currentRevision,
        baseRevision,
      };
      if (idempotencyKey) {
        await storeIdempotencyResult(
          idempotencyKey,
          slug,
          route,
          conflictResponse,
          409,
          hashRequestBody(body),
        );
      }
      return Response.json(conflictResponse, { status: 409 });
    }

    await addDocumentEvent(slug, 'document.edited', { operations }, 'api', {
      documentRevision: result.newRevision,
      idempotencyKey: idempotencyKey ?? undefined,
      mutationRoute: route,
    });

    const successResponse = {
      revision: result.newRevision,
      markdown,
    };

    if (idempotencyKey) {
      await storeIdempotencyResult(
        idempotencyKey,
        slug,
        route,
        successResponse,
        200,
        hashRequestBody(body),
      );
    }

    return Response.json(successResponse);
  } catch (err) {
    console.error('[POST /api/documents/:slug/edit/v2] Error:', err);
    return jsonError('Internal server error', 500);
  }
}
