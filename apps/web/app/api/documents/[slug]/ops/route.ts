import { NextRequest } from 'next/server';
import {
  getDocumentBySlug,
  updateMarks,
  bumpDocumentRevision,
  addDocumentEvent,
  getStoredIdempotencyResult,
  storeIdempotencyResult,
} from '@proof-clone/db';
import {
  generateMarkId,
  generateThreadId,
  normalizeQuote,
} from '@proof-clone/core';
import type { StoredMark, CommentReply } from '@proof-clone/core';
import {
  getIdempotencyKey,
  hashRequestBody,
  jsonError,
} from '../../../../../lib/api-utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { op, ...payload } = body as { op: string; [key: string]: unknown };

    if (!op || typeof op !== 'string') {
      return jsonError('op is required', 400);
    }

    // Idempotency check
    const idempotencyKey = getIdempotencyKey(request);
    const route = `ops/${op}`;
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

    const marks = (doc.marks ?? {}) as Record<string, StoredMark>;
    let responseBody: Record<string, unknown>;

    switch (op) {
      case 'comment.add': {
        const { quote, text, by, selector } = payload as {
          quote?: string;
          text?: string;
          by?: string;
          selector?: unknown;
        };
        if (!text || typeof text !== 'string') {
          return jsonError('text is required for comment.add', 400);
        }
        if (!by || typeof by !== 'string') {
          return jsonError('by is required for comment.add', 400);
        }
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
        responseBody = { markId, mark };
        break;
      }

      case 'comment.reply': {
        const { markId, text, by } = payload as {
          markId?: string;
          text?: string;
          by?: string;
        };
        if (!markId || !text || !by) {
          return jsonError('markId, text, and by are required for comment.reply', 400);
        }
        const commentMark = marks[markId];
        if (!commentMark || commentMark.kind !== 'comment') {
          return jsonError('Comment mark not found', 404);
        }
        const reply: CommentReply = {
          by,
          text,
          at: new Date().toISOString(),
        };
        const existingReplies = Array.isArray(commentMark.replies)
          ? commentMark.replies
          : Array.isArray(commentMark.thread)
            ? (commentMark.thread as unknown as CommentReply[])
            : [];
        commentMark.replies = [...existingReplies, reply];
        marks[markId] = commentMark;
        await updateMarks(slug, marks);
        await addDocumentEvent(slug, 'comment.replied', { markId, by, text }, by);
        responseBody = { markId, reply };
        break;
      }

      case 'comment.resolve': {
        const { markId, by } = payload as { markId?: string; by?: string };
        if (!markId) {
          return jsonError('markId is required for comment.resolve', 400);
        }
        const targetMark = marks[markId];
        if (!targetMark || targetMark.kind !== 'comment') {
          return jsonError('Comment mark not found', 404);
        }
        targetMark.resolved = true;
        marks[markId] = targetMark;
        await updateMarks(slug, marks);
        const actor = by || 'system';
        await addDocumentEvent(slug, 'comment.resolved', { markId, by: actor }, actor);
        responseBody = { markId, resolved: true };
        break;
      }

      case 'suggestion.add': {
        const { kind, quote, content, by } = payload as {
          kind?: 'insert' | 'delete' | 'replace';
          quote?: string;
          content?: string;
          by?: string;
        };
        if (!kind || !['insert', 'delete', 'replace'].includes(kind)) {
          return jsonError('kind must be insert, delete, or replace', 400);
        }
        if (!by || typeof by !== 'string') {
          return jsonError('by is required for suggestion.add', 400);
        }
        if ((kind === 'insert' || kind === 'replace') && !content) {
          return jsonError('content is required for insert/replace suggestions', 400);
        }
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
        responseBody = { markId, mark };
        break;
      }

      case 'mark.accept': {
        const { markId, by } = payload as { markId?: string; by?: string };
        if (!markId) {
          return jsonError('markId is required for mark.accept', 400);
        }
        const acceptMark = marks[markId];
        if (!acceptMark) {
          return jsonError('Mark not found', 404);
        }
        if (
          acceptMark.kind !== 'insert' &&
          acceptMark.kind !== 'delete' &&
          acceptMark.kind !== 'replace'
        ) {
          return jsonError('Only suggestion marks can be accepted', 400);
        }
        acceptMark.status = 'accepted';
        marks[markId] = acceptMark;

        // Apply the suggestion to the document markdown
        let markdown = doc.markdown;
        if (acceptMark.kind === 'insert' && acceptMark.content && acceptMark.quote) {
          const idx = markdown.indexOf(acceptMark.quote);
          if (idx !== -1) {
            markdown =
              markdown.slice(0, idx + acceptMark.quote.length) +
              acceptMark.content +
              markdown.slice(idx + acceptMark.quote.length);
          }
        } else if (acceptMark.kind === 'delete' && acceptMark.quote) {
          markdown = markdown.replace(acceptMark.quote, '');
        } else if (acceptMark.kind === 'replace' && acceptMark.content && acceptMark.quote) {
          markdown = markdown.replace(acceptMark.quote, acceptMark.content);
        }

        await updateMarks(slug, marks);
        const { newRevision } = await bumpDocumentRevision(slug, markdown, marks);
        const actor = by || 'system';
        await addDocumentEvent(
          slug,
          'mark.accepted',
          { markId, kind: acceptMark.kind },
          actor,
          { documentRevision: newRevision },
        );
        responseBody = { markId, status: 'accepted', revision: newRevision, markdown };
        break;
      }

      case 'mark.reject': {
        const { markId, by } = payload as { markId?: string; by?: string };
        if (!markId) {
          return jsonError('markId is required for mark.reject', 400);
        }
        const rejectMark = marks[markId];
        if (!rejectMark) {
          return jsonError('Mark not found', 404);
        }
        if (
          rejectMark.kind !== 'insert' &&
          rejectMark.kind !== 'delete' &&
          rejectMark.kind !== 'replace'
        ) {
          return jsonError('Only suggestion marks can be rejected', 400);
        }
        rejectMark.status = 'rejected';
        marks[markId] = rejectMark;
        await updateMarks(slug, marks);
        const actor = by || 'system';
        await addDocumentEvent(slug, 'mark.rejected', { markId, kind: rejectMark.kind }, actor);
        responseBody = { markId, status: 'rejected' };
        break;
      }

      case 'rewrite.apply': {
        const { markdown: newMarkdown, by } = payload as {
          markdown?: string;
          by?: string;
        };
        if (!newMarkdown || typeof newMarkdown !== 'string') {
          return jsonError('markdown is required for rewrite.apply', 400);
        }
        const actor = by || 'system';
        const { newRevision } = await bumpDocumentRevision(slug, newMarkdown, marks);
        await addDocumentEvent(
          slug,
          'rewrite.applied',
          { by: actor },
          actor,
          { documentRevision: newRevision },
        );
        responseBody = { revision: newRevision, markdown: newMarkdown };
        break;
      }

      default:
        return jsonError(`Unknown operation: ${op}`, 400);
    }

    // Store idempotency result
    if (idempotencyKey) {
      await storeIdempotencyResult(
        idempotencyKey,
        slug,
        route,
        responseBody,
        200,
        hashRequestBody(body),
      );
    }

    return Response.json(responseBody);
  } catch (err) {
    console.error('[POST /api/documents/:slug/ops] Error:', err);
    return jsonError('Internal server error', 500);
  }
}
