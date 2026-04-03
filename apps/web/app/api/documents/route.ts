import { NextRequest } from 'next/server';
import {
  createDocument,
  listActiveDocuments,
  createDocumentAccessToken,
} from '@proof-clone/db';
import { extractMarks } from '@proof-clone/core';
import {
  generateSlug,
  generateSecret,
  hashSecret,
  getAuthToken,
  jsonError,
} from '../../../lib/api-utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { markdown, title, role, ownerId } = body as {
      markdown?: string;
      title?: string;
      role?: string;
      ownerId?: string;
    };

    if (!markdown || typeof markdown !== 'string') {
      return jsonError('markdown is required and must be a string', 400);
    }

    // Extract embedded marks from the markdown content
    const { content, marks: extractedMarks } = extractMarks(markdown);

    const slug = generateSlug();
    const ownerSecret = generateSecret();
    const ownerSecretHash = hashSecret(ownerSecret);

    const doc = await createDocument(
      slug,
      content,
      extractedMarks as Record<string, unknown>,
      title,
      ownerId,
      ownerSecret,
      ownerSecretHash,
    );

    let accessToken: string | undefined;
    if (role && (role === 'viewer' || role === 'commenter' || role === 'editor')) {
      const tokenSecret = generateSecret();
      const tokenSecretHash = hashSecret(tokenSecret);
      await createDocumentAccessToken(slug, role, tokenSecretHash);
      accessToken = tokenSecret;
    }

    return Response.json({
      success: true,
      slug,
      docId: doc.doc_id,
      url: `/d/${slug}`,
      shareUrl: `/d/${slug}`,
      ownerSecret,
      ...(accessToken ? { accessToken, accessRole: role } : {}),
      active: true,
      shareState: doc.share_state,
      createdAt: doc.created_at,
      _links: {
        view: `/d/${slug}`,
        state: `/api/documents/${slug}/state`,
        ops: { method: 'POST', href: `/api/documents/${slug}/ops` },
        events: `/api/documents/${slug}/events/pending?after=0`,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/documents] Error:', err);
    return jsonError('Internal server error', 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return jsonError('Authentication required', 401);
    }

    const documents = await listActiveDocuments();

    return Response.json({
      documents: documents.map((doc) => ({
        slug: doc.slug,
        docId: doc.doc_id,
        title: doc.title,
        shareState: doc.share_state,
        revision: doc.revision,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      })),
    });
  } catch (err) {
    console.error('[GET /api/documents] Error:', err);
    return jsonError('Internal server error', 500);
  }
}
