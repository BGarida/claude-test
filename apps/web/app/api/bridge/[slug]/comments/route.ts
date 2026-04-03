import { NextRequest } from 'next/server';
import {
  getDocumentBySlug,
  updateMarks,
  addDocumentEvent,
  resolveDocumentAccess,
} from '@proof-clone/db';
import { generateMarkId, generateThreadId, normalizeQuote } from '@proof-clone/core';
import type { StoredMark } from '@proof-clone/core';
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
    const { quote, text, by, selector } = body as {
      quote?: string;
      text?: string;
      by?: string;
      selector?: unknown;
    };

    if (!text || typeof text !== 'string') {
      return jsonError('text is required', 400);
    }
    if (!by || typeof by !== 'string') {
      return jsonError('by is required', 400);
    }
    if (!quote && !selector) {
      return jsonError('quote or selector is required to anchor the comment', 400);
    }

    const marks = (doc.marks ?? {}) as Record<string, StoredMark>;
    const markId = generateMarkId();
    const threadId = generateThreadId();

    const mark: StoredMark = {
      kind: 'comment',
      by,
      createdAt: new Date().toISOString(),
      text,
      thread: threadId,
      resolved: false,
      replies: [],
      quote: quote ? normalizeQuote(quote) : undefined,
    };

    marks[markId] = mark;
    await updateMarks(slug, marks);
    await addDocumentEvent(slug, 'comment.added', { markId, by, text, quote }, by);

    return Response.json({ markId, mark }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/bridge/:slug/comments] Error:', err);
    return jsonError('Internal server error', 500);
  }
}
