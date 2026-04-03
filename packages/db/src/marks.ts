import { getSupabaseClient } from './client';
import type { MarkTombstoneRow } from './types';

/**
 * Update the marks JSONB column on a document.
 */
export async function updateMarks(
  slug: string,
  marks: Record<string, unknown>,
): Promise<boolean> {
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('documents')
    .update({ marks })
    .eq('slug', slug);

  if (error) throw error;
  return true;
}

/**
 * Upsert a mark tombstone (soft-delete record for a resolved/deleted mark).
 */
export async function upsertMarkTombstone(
  slug: string,
  markId: string,
  status: string,
  resolvedRevision: number,
  expiresAt: string,
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from('mark_tombstones').upsert(
    {
      document_slug: slug,
      mark_id: markId,
      status,
      resolved_revision: resolvedRevision,
      expires_at: expiresAt,
    },
    { onConflict: 'document_slug,mark_id' },
  );

  if (error) throw error;
}

/**
 * Get a single mark tombstone by slug + mark id.
 */
export async function getMarkTombstone(
  slug: string,
  markId: string,
): Promise<MarkTombstoneRow | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('mark_tombstones')
    .select('*')
    .eq('document_slug', slug)
    .eq('mark_id', markId)
    .maybeSingle();

  if (error) throw error;
  return (data as MarkTombstoneRow) ?? null;
}

/**
 * List all mark tombstones for a document.
 */
export async function listMarkTombstonesForDocument(
  slug: string,
): Promise<MarkTombstoneRow[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('mark_tombstones')
    .select('*')
    .eq('document_slug', slug)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as MarkTombstoneRow[];
}

/**
 * Delete mark tombstones whose expires_at has passed.
 * Returns the number of rows removed.
 */
export async function cleanupExpiredMarkTombstones(): Promise<number> {
  const sb = getSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from('mark_tombstones')
    .delete()
    .lt('expires_at', now)
    .select('mark_id');

  if (error) throw error;
  return data?.length ?? 0;
}
