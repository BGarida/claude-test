-- Proof Clone: Initial Schema Migration
-- Migrated from SQLite (EveryInc/proof-sdk) to Supabase Postgres
-- Run with: supabase db push (or paste into Supabase SQL editor)

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE share_state AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED', 'DELETED');
CREATE TYPE share_role AS ENUM ('viewer', 'commenter', 'editor');
CREATE TYPE projection_health AS ENUM ('healthy', 'projection_stale', 'quarantined');
CREATE TYPE mutation_idempotency_state AS ENUM ('pending', 'completed');
CREATE TYPE incident_level AS ENUM ('info', 'warn', 'error', 'fatal');

-- =============================================================================
-- 1. DOCUMENTS (primary table)
-- =============================================================================

CREATE TABLE documents (
  slug TEXT PRIMARY KEY,
  doc_id TEXT UNIQUE,
  title TEXT,
  markdown TEXT NOT NULL DEFAULT '',
  marks JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision INTEGER NOT NULL DEFAULT 1,
  y_state_version INTEGER NOT NULL DEFAULT 0,
  share_state share_state NOT NULL DEFAULT 'ACTIVE',
  access_epoch INTEGER NOT NULL DEFAULT 0,
  collab_bootstrap_epoch INTEGER NOT NULL DEFAULT 0,
  live_collab_seen_at TIMESTAMPTZ,
  live_collab_access_epoch INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  owner_id TEXT,
  owner_secret TEXT,
  owner_secret_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_documents_share_state ON documents(share_state);
CREATE INDEX idx_documents_slug_revision ON documents(slug, revision);
CREATE INDEX idx_documents_owner_id ON documents(owner_id);

-- =============================================================================
-- 2. DOCUMENT PROJECTIONS (cached derived state from Yjs)
-- =============================================================================

CREATE TABLE document_projections (
  document_slug TEXT PRIMARY KEY REFERENCES documents(slug),
  revision INTEGER NOT NULL,
  y_state_version INTEGER NOT NULL DEFAULT 0,
  markdown TEXT NOT NULL DEFAULT '',
  marks_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  plain_text TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  health projection_health NOT NULL DEFAULT 'healthy',
  health_reason TEXT
);

CREATE INDEX idx_document_projections_revision ON document_projections(document_slug, revision);
CREATE INDEX idx_document_projections_health ON document_projections(health, updated_at);

-- =============================================================================
-- 3. DOCUMENT ACCESS (token-based auth for share links)
-- =============================================================================

CREATE TABLE document_access (
  token_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_slug TEXT NOT NULL REFERENCES documents(slug),
  role share_role NOT NULL,
  secret_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_document_access_slug ON document_access(document_slug);
CREATE INDEX idx_document_access_secret ON document_access(secret_hash);

-- =============================================================================
-- 4. EVENTS (legacy event log — kept for backward compat)
-- =============================================================================

CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  document_slug TEXT NOT NULL REFERENCES documents(slug),
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_slug ON events(document_slug);

-- =============================================================================
-- 5. DOCUMENT EVENTS (new event log with revision tracking)
-- =============================================================================

CREATE TABLE document_events (
  id BIGSERIAL PRIMARY KEY,
  document_slug TEXT NOT NULL REFERENCES documents(slug),
  document_revision INTEGER,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor TEXT NOT NULL,
  idempotency_key TEXT,
  mutation_route TEXT,
  tombstone_revision INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acked_by TEXT,
  acked_at TIMESTAMPTZ
);

CREATE INDEX idx_document_events_slug_id ON document_events(document_slug, id);
CREATE INDEX idx_document_events_slug_tombstone ON document_events(document_slug, tombstone_revision, id);
CREATE INDEX idx_document_events_slug_revision ON document_events(document_slug, document_revision, id);
CREATE INDEX idx_document_events_slug_idempotency_route ON document_events(document_slug, idempotency_key, mutation_route, id);

-- =============================================================================
-- 6. SERVER INCIDENT EVENTS (error/incident logging)
-- =============================================================================

CREATE TABLE server_incident_events (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT,
  slug TEXT,
  subsystem TEXT NOT NULL,
  level incident_level NOT NULL DEFAULT 'info',
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_server_incidents_request ON server_incident_events(request_id, created_at, id);
CREATE INDEX idx_server_incidents_slug ON server_incident_events(slug, created_at, id);
CREATE INDEX idx_server_incidents_subsystem ON server_incident_events(subsystem, created_at, id);

-- =============================================================================
-- 7. IDEMPOTENCY KEYS (legacy — kept for migration)
-- =============================================================================

CREATE TABLE idempotency_keys (
  idempotency_key TEXT NOT NULL,
  document_slug TEXT NOT NULL,
  route TEXT NOT NULL,
  response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (idempotency_key, document_slug, route)
);

-- =============================================================================
-- 8. MUTATION IDEMPOTENCY (new, with state machine)
-- =============================================================================

CREATE TABLE mutation_idempotency (
  idempotency_key TEXT NOT NULL,
  document_slug TEXT NOT NULL,
  route TEXT NOT NULL,
  response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_hash TEXT,
  status_code INTEGER NOT NULL DEFAULT 200,
  tombstone_revision INTEGER,
  state mutation_idempotency_state NOT NULL DEFAULT 'completed',
  completed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  reservation_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (idempotency_key, document_slug, route)
);

CREATE INDEX idx_mutation_idempotency_slug_created ON mutation_idempotency(document_slug, created_at);
CREATE INDEX idx_mutation_idempotency_slug_tombstone ON mutation_idempotency(document_slug, tombstone_revision, created_at);

-- =============================================================================
-- 9. MUTATION OUTBOX (reliable event delivery)
-- =============================================================================

CREATE TABLE mutation_outbox (
  id BIGSERIAL PRIMARY KEY,
  document_slug TEXT NOT NULL,
  document_revision INTEGER,
  event_id BIGINT UNIQUE,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor TEXT NOT NULL,
  idempotency_key TEXT,
  mutation_route TEXT,
  tombstone_revision INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_mutation_outbox_slug_id ON mutation_outbox(document_slug, id);
CREATE INDEX idx_mutation_outbox_slug_revision ON mutation_outbox(document_slug, document_revision, id);
CREATE INDEX idx_mutation_outbox_pending ON mutation_outbox(document_slug, delivered_at, tombstone_revision, id);
CREATE INDEX idx_mutation_outbox_slug_idempotency ON mutation_outbox(document_slug, idempotency_key, mutation_route, id);

-- =============================================================================
-- 10. MARK TOMBSTONES (soft-deleted marks with TTL)
-- =============================================================================

CREATE TABLE mark_tombstones (
  document_slug TEXT NOT NULL,
  mark_id TEXT NOT NULL,
  status TEXT NOT NULL,
  resolved_revision INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (document_slug, mark_id)
);

CREATE INDEX idx_mark_tombstones_expires ON mark_tombstones(expires_at);
CREATE INDEX idx_mark_tombstones_slug_revision ON mark_tombstones(document_slug, resolved_revision);

-- =============================================================================
-- 11. DOCUMENT BLOCKS (block-level structure for edit v2)
-- =============================================================================

CREATE TABLE document_blocks (
  document_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  node_type TEXT NOT NULL,
  attrs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  markdown_hash TEXT NOT NULL,
  text_preview TEXT NOT NULL DEFAULT '',
  created_revision INTEGER NOT NULL,
  last_seen_revision INTEGER NOT NULL,
  retired_revision INTEGER,
  PRIMARY KEY (document_id, block_id)
);

CREATE UNIQUE INDEX idx_document_blocks_live_ordinal
  ON document_blocks(document_id, ordinal)
  WHERE retired_revision IS NULL;

CREATE INDEX idx_document_blocks_live_doc
  ON document_blocks(document_id, retired_revision, ordinal);

-- =============================================================================
-- 12. YJS UPDATE LOG (incremental CRDT updates)
-- =============================================================================

CREATE TABLE document_y_updates (
  seq BIGSERIAL PRIMARY KEY,
  document_slug TEXT NOT NULL REFERENCES documents(slug),
  update_blob BYTEA NOT NULL,
  source_actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_y_updates_slug_seq ON document_y_updates(document_slug, seq);
CREATE INDEX idx_y_updates_slug_created ON document_y_updates(document_slug, created_at);

-- =============================================================================
-- 13. YJS SNAPSHOTS (periodic compacted state)
-- =============================================================================

CREATE TABLE document_y_snapshots (
  document_slug TEXT NOT NULL REFERENCES documents(slug),
  version INTEGER NOT NULL,
  snapshot_blob BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_slug, version)
);

CREATE INDEX idx_y_snapshots_slug_version ON document_y_snapshots(document_slug, version);

-- =============================================================================
-- 14. MAINTENANCE RUNS (migration/maintenance tracking)
-- =============================================================================

CREATE TABLE maintenance_runs (
  run_key TEXT PRIMARY KEY,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary JSONB
);

-- =============================================================================
-- 15. SHARE AUTH SESSIONS (SSO/OAuth sessions for share links)
-- =============================================================================

CREATE TABLE share_auth_sessions (
  session_token_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  every_user_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  subscriber BOOLEAN NOT NULL DEFAULT true,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  access_expires_at TIMESTAMPTZ NOT NULL,
  session_expires_at TIMESTAMPTZ NOT NULL,
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_share_auth_revoked ON share_auth_sessions(revoked_at);
CREATE INDEX idx_share_auth_expiry ON share_auth_sessions(session_expires_at);

-- =============================================================================
-- 16. ACTIVE COLLAB CONNECTIONS (live WebSocket tracking)
-- =============================================================================

CREATE TABLE active_collab_connections (
  connection_id TEXT PRIMARY KEY,
  document_slug TEXT NOT NULL,
  role share_role NOT NULL,
  access_epoch INTEGER NOT NULL,
  instance_id TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_collab_conn_slug_seen ON active_collab_connections(document_slug, last_seen_at);
CREATE INDEX idx_collab_conn_instance_seen ON active_collab_connections(instance_id, last_seen_at);

-- =============================================================================
-- 17. USER DOCUMENT VISITS (access history)
-- =============================================================================

CREATE TABLE user_document_visits (
  every_user_id INTEGER NOT NULL,
  document_slug TEXT NOT NULL,
  role TEXT,
  first_visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (every_user_id, document_slug)
);

CREATE INDEX idx_udv_user_last ON user_document_visits(every_user_id, last_visited_at);
CREATE INDEX idx_udv_slug ON user_document_visits(document_slug);

-- =============================================================================
-- 18. LIBRARY DOCUMENTS (user's personal library)
-- =============================================================================

CREATE TABLE library_documents (
  every_user_id INTEGER PRIMARY KEY,
  document_slug TEXT NOT NULL REFERENCES documents(slug),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_library_documents_slug ON library_documents(document_slug);

-- =============================================================================
-- 19. SYSTEM METADATA (key-value config store)
-- =============================================================================

CREATE TABLE system_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- HELPER: updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER share_auth_sessions_updated_at
  BEFORE UPDATE ON share_auth_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER library_documents_updated_at
  BEFORE UPDATE ON library_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
