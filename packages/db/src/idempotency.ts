import { getSupabaseClient } from './client';

/**
 * Look up a previously stored idempotency result.
 */
export async function getStoredIdempotencyResult(
  key: string,
  slug: string,
  route: string,
): Promise<{ responseJson: Record<string, unknown>; statusCode: number } | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('mutation_idempotency')
    .select('response_json, status_code')
    .eq('idempotency_key', key)
    .eq('document_slug', slug)
    .eq('route', route)
    .eq('state', 'completed')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    responseJson: data.response_json as Record<string, unknown>,
    statusCode: data.status_code as number,
  };
}

/**
 * Store (upsert) an idempotency result so duplicate mutations are replayed.
 */
export async function storeIdempotencyResult(
  key: string,
  slug: string,
  route: string,
  responseJson: Record<string, unknown>,
  statusCode: number,
  requestHash?: string,
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from('mutation_idempotency').upsert(
    {
      idempotency_key: key,
      document_slug: slug,
      route,
      response_json: responseJson,
      status_code: statusCode,
      request_hash: requestHash ?? null,
      state: 'completed',
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'idempotency_key,document_slug,route' },
  );

  if (error) throw error;
}

/**
 * Delete idempotency records older than `maxAgeMs` (default 7 days).
 * Returns the number of rows removed.
 */
export async function cleanupIdempotencyKeys(
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000,
): Promise<number> {
  const sb = getSupabaseClient();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

  const { data, error } = await sb
    .from('mutation_idempotency')
    .delete()
    .lt('created_at', cutoff)
    .select('idempotency_key');

  if (error) throw error;
  return data?.length ?? 0;
}
