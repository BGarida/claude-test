/**
 * HocusPocus authentication extension.
 *
 * Validates the token supplied by the client during the WebSocket handshake
 * against Supabase document_access records and the document owner secret.
 */

import { createHash } from 'crypto';
import { resolveDocumentAccess } from '@proof-clone/db';

/**
 * SHA-256 hash matching the upstream token-hashing convention.
 */
export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Returns a HocusPocus-compatible extension object that authenticates
 * incoming WebSocket connections using document access tokens.
 */
export function createAuthExtension() {
  return {
    async onAuthenticate(data: {
      token: string;
      documentName: string;
      connection: { readOnly: boolean };
      context: Record<string, unknown>;
    }): Promise<void> {
      const { token, documentName, connection, context } = data;

      if (!token) {
        throw new Error('Authentication token required');
      }

      const secretHash = hashToken(token);
      const access = await resolveDocumentAccess(documentName, secretHash);

      if (!access) {
        throw new Error('Invalid or revoked access token');
      }

      // Mark read-only connections so HocusPocus rejects their edits.
      connection.readOnly = access.role === 'viewer';

      // Attach metadata to the context object for downstream use.
      context.role = access.role;
      context.tokenId = access.tokenId;
      context.accessEpoch = access.accessEpoch;
      context.isOwner = access.isOwner;
    },
  };
}
