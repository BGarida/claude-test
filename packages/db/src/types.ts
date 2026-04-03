// Types matching the Supabase Postgres schema defined in
// supabase/migrations/00001_initial_schema.sql

// ── Enum types ──────────────────────────────────────────────────────────────

export type ShareState = 'ACTIVE' | 'PAUSED' | 'REVOKED' | 'DELETED';
export type ShareRole = 'viewer' | 'commenter' | 'editor';
export type ProjectionHealth = 'healthy' | 'projection_stale' | 'quarantined';
export type MutationIdempotencyState = 'pending' | 'completed';
export type IncidentLevel = 'info' | 'warn' | 'error' | 'fatal';

// ── Table row types ─────────────────────────────────────────────────────────

export interface DocumentRow {
  slug: string;
  doc_id: string | null;
  title: string | null;
  markdown: string;
  marks: Record<string, unknown>;
  revision: number;
  y_state_version: number;
  share_state: ShareState;
  access_epoch: number;
  collab_bootstrap_epoch: number;
  live_collab_seen_at: string | null;
  live_collab_access_epoch: number | null;
  active: boolean;
  owner_id: string | null;
  owner_secret: string | null;
  owner_secret_hash: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DocumentProjectionRow {
  document_slug: string;
  revision: number;
  y_state_version: number;
  markdown: string;
  marks_json: Record<string, unknown>;
  plain_text: string;
  updated_at: string;
  health: ProjectionHealth;
  health_reason: string | null;
}

export interface DocumentAccessRow {
  token_id: string;
  document_slug: string;
  role: ShareRole;
  secret_hash: string;
  created_at: string;
  revoked_at: string | null;
}

export interface DocumentEventRow {
  id: number;
  document_slug: string;
  document_revision: number | null;
  event_type: string;
  event_data: Record<string, unknown>;
  actor: string;
  idempotency_key: string | null;
  mutation_route: string | null;
  tombstone_revision: number | null;
  created_at: string;
  acked_by: string | null;
  acked_at: string | null;
}

export interface DocumentBlockRow {
  document_id: string;
  block_id: string;
  ordinal: number;
  node_type: string;
  attrs_json: Record<string, unknown>;
  markdown_hash: string;
  text_preview: string;
  created_revision: number;
  last_seen_revision: number;
  retired_revision: number | null;
}

export interface MarkTombstoneRow {
  document_slug: string;
  mark_id: string;
  status: string;
  resolved_revision: number;
  created_at: string;
  expires_at: string;
}

export interface DocumentYUpdateRow {
  seq: number;
  document_slug: string;
  update_blob: Uint8Array;
  source_actor: string | null;
  created_at: string;
}

export interface DocumentYSnapshotRow {
  document_slug: string;
  version: number;
  snapshot_blob: Uint8Array;
  created_at: string;
}

export interface ShareAuthSessionRow {
  session_token_hash: string;
  provider: string;
  every_user_id: number;
  email: string;
  name: string | null;
  subscriber: boolean;
  access_token: string;
  refresh_token: string | null;
  access_expires_at: string;
  session_expires_at: string;
  last_verified_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActiveCollabConnectionRow {
  connection_id: string;
  document_slug: string;
  role: ShareRole;
  access_epoch: number;
  instance_id: string;
  connected_at: string;
  last_seen_at: string;
}

export interface MutationIdempotencyRow {
  idempotency_key: string;
  document_slug: string;
  route: string;
  response_json: Record<string, unknown>;
  request_hash: string | null;
  status_code: number;
  tombstone_revision: number | null;
  state: MutationIdempotencyState;
  completed_at: string | null;
  lease_expires_at: string | null;
  last_seen_at: string | null;
  reservation_token: string | null;
  created_at: string;
}

export interface IdempotencyKeyRow {
  idempotency_key: string;
  document_slug: string;
  route: string;
  response_json: Record<string, unknown>;
  request_hash: string | null;
  created_at: string;
}
