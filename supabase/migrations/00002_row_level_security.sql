-- Proof Clone: Row Level Security Policies
-- Single-org workspace model: authenticated users share all documents
-- Agents authenticate via bearer tokens (service role or bridge tokens)

-- =============================================================================
-- ENABLE RLS ON ALL TABLES
-- =============================================================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_y_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_y_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_collab_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_document_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_auth_sessions ENABLE ROW LEVEL SECURITY;

-- Tables accessed only by service role (server-side):
ALTER TABLE server_incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutation_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutation_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE mark_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_metadata ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SERVICE ROLE: Full access (used by Next.js API routes + Render worker)
-- These bypass RLS automatically when using supabase service_role key
-- =============================================================================

-- =============================================================================
-- AUTHENTICATED USERS: Workspace-level access
-- Single org = all authenticated users can access all active documents
-- =============================================================================

-- Documents: read all active, create new, update own or where editor
CREATE POLICY "Users can read active documents"
  ON documents FOR SELECT
  TO authenticated
  USING (active = true AND share_state = 'ACTIVE');

CREATE POLICY "Users can create documents"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update documents they own"
  ON documents FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid()::text);

-- Document projections: read access follows documents
CREATE POLICY "Users can read projections"
  ON document_projections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.slug = document_projections.document_slug
      AND documents.active = true
    )
  );

-- Document access tokens: users can read tokens for accessible docs
CREATE POLICY "Users can read access tokens for their documents"
  ON document_access FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.slug = document_access.document_slug
      AND documents.active = true
    )
  );

-- Events: read events for accessible documents
CREATE POLICY "Users can read events"
  ON events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.slug = events.document_slug
      AND documents.active = true
    )
  );

CREATE POLICY "Users can read document events"
  ON document_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.slug = document_events.document_slug
      AND documents.active = true
    )
  );

-- User document visits: users can manage their own visits
CREATE POLICY "Users can manage own visits"
  ON user_document_visits FOR ALL
  TO authenticated
  USING (every_user_id = (auth.jwt() ->> 'every_user_id')::integer);

-- Library documents: users can manage their own library
CREATE POLICY "Users can manage own library"
  ON library_documents FOR ALL
  TO authenticated
  USING (every_user_id = (auth.jwt() ->> 'every_user_id')::integer);

-- =============================================================================
-- ANONYMOUS / PUBLIC: Share link access
-- Share links use document_access tokens validated at the API layer.
-- Public users get read-only via anon key + validated share token.
-- =============================================================================

CREATE POLICY "Anon can read shared documents via API"
  ON documents FOR SELECT
  TO anon
  USING (share_state = 'ACTIVE' AND active = true);

-- =============================================================================
-- NOTES
-- =============================================================================
--
-- 1. The service_role key (used in Next.js API routes and Render worker)
--    bypasses ALL RLS policies. This is by design — the API layer handles
--    fine-grained access control (owner_secret, access_token, share_token).
--
-- 2. For the agent bridge: agents authenticate via bearer tokens, which are
--    validated in the API route handlers. The API uses service_role to access
--    Supabase, so bridge auth is handled at the application layer, not RLS.
--
-- 3. The Yjs tables (document_y_updates, document_y_snapshots) and collab
--    connection tracking are only accessed by the Render worker via
--    service_role, so no user-facing RLS policies are needed.
--
-- 4. Server-internal tables (incidents, idempotency, outbox, tombstones,
--    maintenance, metadata) are service_role only.
