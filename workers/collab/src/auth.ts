/**
 * HocusPocus authentication extension.
 *
 * Validates the token supplied by the client during the WebSocket handshake
 * against Supabase document_access records and the document owner secret.
 */

import { createHash } from 'crypto';
import type { Extension, onAuthenticatePayload } from '@hocuspocus/server';
import { resolveDocumentAccess } from '@proof-clone/db';

/**
 * SHA-256 hash matching the upstream token-hashing convention.
 */
export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class AuthExtension implements Extension {
  async onAuthenticate(data: onAuthenticatePayload): Promise<void> {
    const { token, documentName, connection } = data;

    if (!token) {
      throw new Error('Authentication token required');
    }

    const secretHash = hashToken(token);
    const access = await resolveDocumentAccess(documentName, secretHash);

    if (!access) {
      throw new Error('Invalid or revoked access token');
    }

    // Store resolved access info on the connection context so other
    // extensions (e.g. persistence) can read it.
    connection.readOnly = access.role === 'viewer';

    // Attach metadata to the context object for downstream use.
    (data.context as Record<string, unknown>).role = access.role;
    (data.context as Record<string, unknown>).tokenId = access.tokenId;
    (data.context as Record<string, unknown>).accessEpoch = access.accessEpoch;
    (data.context as Record<string, unknown>).isOwner = access.isOwner;
  }

  // ── No-op lifecycle hooks (required by Extension interface) ──────────────

  async onLoadDocument() {}
  async onConnect() {}
  async onChange() {}
  async onStoreDocument() {}
  async onDisconnect() {}
  async onConfigure() {}
  async onListen() {}
  async onDestroy() {}
  async onRequest() {}
  async onUpgrade() {}
  async onStateless() {}
  async afterLoadDocument() {}
  async afterStoreDocument() {}
  async afterUnloadDocument() {}
  async onAwarenessUpdate() {}
}
