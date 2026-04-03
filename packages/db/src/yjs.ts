import { getSupabaseClient } from './client';
import type { DocumentYUpdateRow } from './types';

// ── Helpers for BYTEA <-> Uint8Array ────────────────────────────────────────
// Supabase PostgREST returns BYTEA columns as base64-encoded strings and
// accepts them the same way.  We convert transparently.

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function decodeBlob(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (typeof raw === 'string') return fromBase64(raw);
  if (Buffer.isBuffer(raw)) return new Uint8Array(raw);
  throw new Error('Unexpected blob type: ' + typeof raw);
}

// ── Y-Update log ────────────────────────────────────────────────────────────

/**
 * Append a Yjs incremental update. Returns the new sequence number.
 */
export async function appendYUpdate(
  documentSlug: string,
  update: Uint8Array,
  sourceActor?: string,
): Promise<number> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('document_y_updates')
    .insert({
      document_slug: documentSlug,
      update_blob: toBase64(update),
      source_actor: sourceActor ?? null,
    })
    .select('seq')
    .single();

  if (error) throw error;
  return data.seq as number;
}

/**
 * Get all Y-updates whose seq is strictly greater than `afterSeq`.
 */
export async function getYUpdatesAfter(
  documentSlug: string,
  afterSeq: number,
): Promise<DocumentYUpdateRow[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('document_y_updates')
    .select('*')
    .eq('document_slug', documentSlug)
    .gt('seq', afterSeq)
    .order('seq', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    update_blob: decodeBlob(row.update_blob),
  })) as DocumentYUpdateRow[];
}

/**
 * Get the single latest Y-update for a document.
 */
export async function getLatestYUpdate(
  documentSlug: string,
): Promise<DocumentYUpdateRow | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('document_y_updates')
    .select('*')
    .eq('document_slug', documentSlug)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    update_blob: decodeBlob((data as any).update_blob),
  } as DocumentYUpdateRow;
}

/**
 * Return the current y_state_version for a document from the documents table.
 */
export async function getLatestYStateVersion(
  documentSlug: string,
): Promise<number> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('documents')
    .select('y_state_version')
    .eq('slug', documentSlug)
    .single();

  if (error) throw error;
  return data.y_state_version as number;
}

// ── Y-State blob (stored as a single snapshot in document_y_snapshots) ──────
// We use version = 0 as the sentinel for the "current compacted state".

const Y_STATE_BLOB_VERSION = 0;

/**
 * Upsert the compacted Yjs state blob.
 */
export async function updateYStateBlob(
  slug: string,
  blob: Uint8Array,
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from('document_y_snapshots').upsert(
    {
      document_slug: slug,
      version: Y_STATE_BLOB_VERSION,
      snapshot_blob: toBase64(blob),
    },
    { onConflict: 'document_slug,version' },
  );

  if (error) throw error;
}

/**
 * Get the compacted Yjs state blob, or null if none exists.
 */
export async function getYStateBlob(
  slug: string,
): Promise<Uint8Array | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('document_y_snapshots')
    .select('snapshot_blob')
    .eq('document_slug', slug)
    .eq('version', Y_STATE_BLOB_VERSION)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return decodeBlob((data as any).snapshot_blob);
}

// ── Snapshots (versioned) ───────────────────────────────────────────────────

/**
 * Save a named snapshot at a specific version.
 */
export async function saveYSnapshot(
  documentSlug: string,
  version: number,
  snapshot: Uint8Array,
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from('document_y_snapshots').upsert(
    {
      document_slug: documentSlug,
      version,
      snapshot_blob: toBase64(snapshot),
    },
    { onConflict: 'document_slug,version' },
  );

  if (error) throw error;
}

/**
 * Get the latest versioned snapshot (highest version, excluding the
 * state-blob sentinel at version 0).
 */
export async function getLatestYSnapshot(
  documentSlug: string,
): Promise<{ version: number; snapshot: Uint8Array } | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('document_y_snapshots')
    .select('version, snapshot_blob')
    .eq('document_slug', documentSlug)
    .gt('version', Y_STATE_BLOB_VERSION)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    version: data.version as number,
    snapshot: decodeBlob((data as any).snapshot_blob),
  };
}

// ── Pruning ─────────────────────────────────────────────────────────────────

/**
 * Delete Y-update rows with seq <= keepAfterSeq.
 * Returns the number of rows removed.
 */
export async function pruneYHistory(
  slug: string,
  keepAfterSeq: number,
): Promise<number> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('document_y_updates')
    .delete()
    .eq('document_slug', slug)
    .lte('seq', keepAfterSeq)
    .select('seq');

  if (error) throw error;
  return data?.length ?? 0;
}
