import { getSupabaseClient } from './client';
import type { DocumentEventRow } from './types';

export interface AddDocumentEventOpts {
  documentRevision?: number;
  idempotencyKey?: string;
  mutationRoute?: string;
  tombstoneRevision?: number;
}

/**
 * Append a new event to the document_events log.
 */
export async function addDocumentEvent(
  slug: string,
  eventType: string,
  eventData: Record<string, unknown>,
  actor: string,
  opts?: AddDocumentEventOpts,
): Promise<void> {
  const sb = getSupabaseClient();
  const row: Record<string, unknown> = {
    document_slug: slug,
    event_type: eventType,
    event_data: eventData,
    actor,
  };
  if (opts?.documentRevision !== undefined)
    row.document_revision = opts.documentRevision;
  if (opts?.idempotencyKey !== undefined)
    row.idempotency_key = opts.idempotencyKey;
  if (opts?.mutationRoute !== undefined)
    row.mutation_route = opts.mutationRoute;
  if (opts?.tombstoneRevision !== undefined)
    row.tombstone_revision = opts.tombstoneRevision;

  const { error } = await sb.from('document_events').insert(row);
  if (error) throw error;
}

/**
 * List events for a document, optionally filtered to those after a given id.
 */
export async function listDocumentEvents(
  slug: string,
  after?: number,
  limit: number = 100,
): Promise<DocumentEventRow[]> {
  const sb = getSupabaseClient();
  let query = sb
    .from('document_events')
    .select('*')
    .eq('document_slug', slug)
    .order('id', { ascending: true })
    .limit(limit);

  if (after !== undefined) {
    query = query.gt('id', after);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DocumentEventRow[];
}

/**
 * Acknowledge events up to a given id.
 * Returns the number of events acked.
 */
export async function ackDocumentEvents(
  slug: string,
  upToId: number,
  ackedBy: string,
): Promise<number> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('document_events')
    .update({ acked_by: ackedBy, acked_at: new Date().toISOString() })
    .eq('document_slug', slug)
    .lte('id', upToId)
    .is('acked_at', null)
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}
