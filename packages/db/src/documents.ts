import { getSupabaseClient } from './client';
import type { DocumentRow, ShareState } from './types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function throwOnError<T>(result: { data: T; error: any }): T {
  if (result.error) throw result.error;
  return result.data;
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function createDocument(
  slug: string,
  markdown: string,
  marks: Record<string, unknown>,
  title?: string,
  ownerId?: string,
  ownerSecret?: string,
  ownerSecretHash?: string,
): Promise<DocumentRow> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('documents')
    .insert({
      slug,
      markdown,
      marks,
      title: title ?? null,
      owner_id: ownerId ?? null,
      owner_secret: ownerSecret ?? null,
      owner_secret_hash: ownerSecretHash ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as DocumentRow;
}

export async function getDocumentBySlug(
  slug: string,
): Promise<DocumentRow | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('documents')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return (data as DocumentRow) ?? null;
}

export async function updateDocument(
  slug: string,
  updates: Partial<DocumentRow>,
): Promise<boolean> {
  const sb = getSupabaseClient();
  const { error, count } = await sb
    .from('documents')
    .update(updates)
    .eq('slug', slug);

  if (error) throw error;
  // Supabase returns count only with head:true or count option, so we
  // assume success when no error is thrown.
  return true;
}

export async function updateDocumentTitle(
  slug: string,
  title: string,
): Promise<boolean> {
  return updateDocument(slug, { title } as Partial<DocumentRow>);
}

/**
 * Optimistic-concurrency update: only succeeds when the current revision
 * matches `baseRevision`.  Returns the new revision on success, or the
 * current revision on conflict so the caller can retry.
 */
export async function updateDocumentByRevision(
  slug: string,
  baseRevision: number,
  markdown: string,
  marks: Record<string, unknown>,
  yStateVersion?: number,
): Promise<{ success: boolean; newRevision: number; currentRevision: number }> {
  const sb = getSupabaseClient();

  const updatePayload: Record<string, unknown> = {
    markdown,
    marks,
    revision: baseRevision + 1,
  };
  if (yStateVersion !== undefined) {
    updatePayload.y_state_version = yStateVersion;
  }

  const { data, error } = await sb
    .from('documents')
    .update(updatePayload)
    .eq('slug', slug)
    .eq('revision', baseRevision)
    .select('revision')
    .maybeSingle();

  if (error) throw error;

  if (data) {
    return {
      success: true,
      newRevision: data.revision as number,
      currentRevision: data.revision as number,
    };
  }

  // Conflict — fetch the current revision so the caller knows where we are.
  const current = await getDocumentBySlug(slug);
  return {
    success: false,
    newRevision: baseRevision,
    currentRevision: current?.revision ?? baseRevision,
  };
}

/**
 * Unconditionally bump the revision of a document, optionally updating
 * markdown, marks and y_state_version at the same time.
 */
export async function bumpDocumentRevision(
  slug: string,
  markdown?: string,
  marks?: Record<string, unknown>,
  yStateVersion?: number,
): Promise<{ newRevision: number; updatedAt: string }> {
  const sb = getSupabaseClient();

  // Fetch current revision first so we can increment.
  const { data: current, error: fetchErr } = await sb
    .from('documents')
    .select('revision')
    .eq('slug', slug)
    .single();

  if (fetchErr) throw fetchErr;

  const newRevision = (current.revision as number) + 1;

  const updatePayload: Record<string, unknown> = { revision: newRevision };
  if (markdown !== undefined) updatePayload.markdown = markdown;
  if (marks !== undefined) updatePayload.marks = marks;
  if (yStateVersion !== undefined) updatePayload.y_state_version = yStateVersion;

  const { data, error } = await sb
    .from('documents')
    .update(updatePayload)
    .eq('slug', slug)
    .select('revision, updated_at')
    .single();

  if (error) throw error;
  return {
    newRevision: data.revision as number,
    updatedAt: data.updated_at as string,
  };
}

// ── State transitions ───────────────────────────────────────────────────────

async function setShareState(
  slug: string,
  state: ShareState,
): Promise<boolean> {
  const sb = getSupabaseClient();
  const extra: Record<string, unknown> = {};
  if (state === 'DELETED') extra.deleted_at = new Date().toISOString();

  const { error } = await sb
    .from('documents')
    .update({ share_state: state, ...extra })
    .eq('slug', slug);

  if (error) throw error;
  return true;
}

export async function pauseDocument(slug: string): Promise<boolean> {
  return setShareState(slug, 'PAUSED');
}

export async function resumeDocument(slug: string): Promise<boolean> {
  return setShareState(slug, 'ACTIVE');
}

export async function revokeDocument(slug: string): Promise<boolean> {
  return setShareState(slug, 'REVOKED');
}

export async function deleteDocument(slug: string): Promise<boolean> {
  return setShareState(slug, 'DELETED');
}

// ── Listing ─────────────────────────────────────────────────────────────────

export async function listActiveDocuments(): Promise<DocumentRow[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('documents')
    .select('*')
    .eq('share_state', 'ACTIVE')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as DocumentRow[];
}
