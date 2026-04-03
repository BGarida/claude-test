import { NextRequest } from 'next/server';
import {
  getDocumentBySlug,
  updateMarks,
  addDocumentEvent,
  resolveDocumentAccess,
} from '@proof-clone/db';
import { generateMarkId, normalizeQuote } from '@proof-clone/core';
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
    const { kind, quote, content, by } = body as {
      kind?: 'insert' | 'delete' | 'replace';
      quote?: string;
      content?: string;
      by?: string;
    };

    if (!kind || !['insert', 'delete', 'replace'].includes(kind)) {
      return jsonError('kind must be insert, delete, or replace', 400);
    }
    if (!by || typeof by !== 'string') {
      return jsonError('by is required', 400);
    }
    if ((kind === 'insert' || kind === 'replace') && !content) {
      return jsonError('content is required for insert/replace suggestions', 400);
    }

    const marks = (doc.marks ?? {}) as Record<string, StoredMark>;
    const markId = generateMarkId();

    const mark: StoredMark = {
      kind,
      by,
      createdAt: new Date().toISOString(),
      status: 'pending',
      quote: quote ? normalizeQuote(quote) : undefined,
      ...(content !== undefined ? { content } : {}),
    };

    marks[markId] = mark;
    await updateMarks(slug, marks);
    await addDocumentEvent(slug, 'suggestion.added', { markId, kind, by, quote }, by);

    return Response.json({ markId, mark }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/bridge/:slug/suggestions] Error:', err);
    return jsonError('Internal server error', 500);
  }
}
