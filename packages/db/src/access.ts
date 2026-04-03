import { getSupabaseClient } from './client';
import type { DocumentAccessRow, ShareRole } from './types';

/**
 * Create a new access token for a document.
 */
export async function createDocumentAccessToken(
  documentSlug: string,
  role: ShareRole,
  secretHash: string,
): Promise<DocumentAccessRow> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('document_access')
    .insert({
      document_slug: documentSlug,
      role,
      secret_hash: secretHash,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as DocumentAccessRow;
}

/**
 * Resolve a document access record by slug + secret hash.
 * Checks both access tokens and owner-level credentials.
 * Returns null when the secret does not match any token or the owner.
 */
export async function resolveDocumentAccess(
  slug: string,
  secretHash: string,
): Promise<{
  tokenId: string;
  role: ShareRole;
  accessEpoch: number;
  isOwner: boolean;
} | null> {
  const sb = getSupabaseClient();

  // 1. Check owner secret hash on the document itself.
  const { data: doc, error: docErr } = await sb
    .from('documents')
    .select('owner_secret_hash, access_epoch')
    .eq('slug', slug)
    .maybeSingle();

  if (docErr) throw docErr;
  if (!doc) return null;

  if (doc.owner_secret_hash && doc.owner_secret_hash === secretHash) {
    return {
      tokenId: 'owner',
      role: 'editor',
      accessEpoch: doc.access_epoch as number,
      isOwner: true,
    };
  }

  // 2. Look up in the document_access table.
  const { data: token, error: tokenErr } = await sb
    .from('document_access')
    .select('token_id, role, document_slug')
    .eq('document_slug', slug)
    .eq('secret_hash', secretHash)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tokenErr) throw tokenErr;
  if (!token) return null;

  return {
    tokenId: token.token_id as string,
    role: token.role as ShareRole,
    accessEpoch: doc.access_epoch as number,
    isOwner: false,
  };
}

/**
 * Convenience wrapper that only returns the role (or null).
 */
export async function resolveDocumentAccessRole(
  slug: string,
  secretHash: string,
): Promise<ShareRole | null> {
  const result = await resolveDocumentAccess(slug, secretHash);
  return result?.role ?? null;
}

/**
 * Soft-revoke all access tokens for a document by setting revoked_at.
 * Returns the number of revoked tokens.
 */
export async function revokeDocumentAccessTokens(
  documentSlug: string,
): Promise<number> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('document_access')
    .update({ revoked_at: new Date().toISOString() })
    .eq('document_slug', documentSlug)
    .is('revoked_at', null)
    .select('token_id');

  if (error) throw error;
  return data?.length ?? 0;
}

/**
 * Bump the access epoch on a document (invalidates all cached access checks).
 * Returns the new epoch value, or null if the document was not found.
 */
export async function bumpDocumentAccessEpoch(
  slug: string,
): Promise<number | null> {
  const sb = getSupabaseClient();

  // Fetch current epoch first.
  const { data: doc, error: fetchErr } = await sb
    .from('documents')
    .select('access_epoch')
    .eq('slug', slug)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!doc) return null;

  const newEpoch = (doc.access_epoch as number) + 1;

  const { error: updateErr } = await sb
    .from('documents')
    .update({ access_epoch: newEpoch })
    .eq('slug', slug);

  if (updateErr) throw updateErr;
  return newEpoch;
}
