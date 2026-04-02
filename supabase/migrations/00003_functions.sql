-- Proof Clone: Database Functions
-- Postgres functions that replace key SQLite synchronous operations

-- =============================================================================
-- Document revision bump (atomic increment)
-- =============================================================================

CREATE OR REPLACE FUNCTION bump_document_revision(
  p_slug TEXT,
  p_markdown TEXT DEFAULT NULL,
  p_marks JSONB DEFAULT NULL,
  p_y_state_version INTEGER DEFAULT NULL
)
RETURNS TABLE(new_revision INTEGER, new_updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE documents
  SET
    revision = revision + 1,
    markdown = COALESCE(p_markdown, markdown),
    marks = COALESCE(p_marks, marks),
    y_state_version = COALESCE(p_y_state_version, y_state_version),
    updated_at = now()
  WHERE slug = p_slug AND active = true
  RETURNING revision, updated_at;
END;
$$;

-- =============================================================================
-- Atomic document update (optimistic locking by revision)
-- =============================================================================

CREATE OR REPLACE FUNCTION update_document_by_revision(
  p_slug TEXT,
  p_base_revision INTEGER,
  p_markdown TEXT,
  p_marks JSONB,
  p_y_state_version INTEGER DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  new_revision INTEGER,
  current_revision INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current INTEGER;
  v_new INTEGER;
BEGIN
  -- Get current revision
  SELECT revision INTO v_current
  FROM documents WHERE slug = p_slug AND active = true
  FOR UPDATE;

  IF v_current IS NULL THEN
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  IF v_current != p_base_revision THEN
    RETURN QUERY SELECT false, 0, v_current;
    RETURN;
  END IF;

  UPDATE documents
  SET
    revision = revision + 1,
    markdown = p_markdown,
    marks = p_marks,
    y_state_version = COALESCE(p_y_state_version, y_state_version),
    updated_at = now()
  WHERE slug = p_slug
  RETURNING revision INTO v_new;

  RETURN QUERY SELECT true, v_new, v_current;
END;
$$;

-- =============================================================================
-- Bump access epoch (invalidate existing tokens)
-- =============================================================================

CREATE OR REPLACE FUNCTION bump_access_epoch(p_slug TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_epoch INTEGER;
BEGIN
  UPDATE documents
  SET access_epoch = access_epoch + 1, updated_at = now()
  WHERE slug = p_slug AND active = true
  RETURNING access_epoch INTO v_new_epoch;

  RETURN v_new_epoch;
END;
$$;

-- =============================================================================
-- Acknowledge events (mark as read up to ID)
-- =============================================================================

CREATE OR REPLACE FUNCTION ack_document_events(
  p_slug TEXT,
  p_up_to_id BIGINT,
  p_acked_by TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE document_events
  SET acked_by = p_acked_by, acked_at = now()
  WHERE document_slug = p_slug
    AND id <= p_up_to_id
    AND acked_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =============================================================================
-- Resolve document access (verify token, return role)
-- =============================================================================

CREATE OR REPLACE FUNCTION resolve_document_access(
  p_slug TEXT,
  p_secret_hash TEXT
)
RETURNS TABLE(
  token_id TEXT,
  role share_role,
  access_epoch INTEGER,
  is_owner BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check owner secret first
  IF EXISTS (
    SELECT 1 FROM documents
    WHERE slug = p_slug
      AND owner_secret_hash = p_secret_hash
      AND active = true
  ) THEN
    RETURN QUERY
    SELECT
      'owner'::TEXT,
      'editor'::share_role,
      d.access_epoch,
      true
    FROM documents d WHERE d.slug = p_slug;
    RETURN;
  END IF;

  -- Check access tokens
  RETURN QUERY
  SELECT
    da.token_id,
    da.role,
    d.access_epoch,
    false
  FROM document_access da
  JOIN documents d ON d.slug = da.document_slug
  WHERE da.document_slug = p_slug
    AND da.secret_hash = p_secret_hash
    AND da.revoked_at IS NULL
    AND d.active = true;
END;
$$;

-- =============================================================================
-- Cleanup expired data (run periodically)
-- =============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_data(
  p_idempotency_max_age INTERVAL DEFAULT '24 hours',
  p_outbox_max_age INTERVAL DEFAULT '30 days',
  p_tombstone_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE(
  idempotency_cleaned INTEGER,
  outbox_cleaned INTEGER,
  tombstones_cleaned INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_idem INTEGER;
  v_outbox INTEGER;
  v_tomb INTEGER;
BEGIN
  DELETE FROM idempotency_keys
  WHERE created_at < now() - p_idempotency_max_age;
  GET DIAGNOSTICS v_idem = ROW_COUNT;

  DELETE FROM mutation_outbox
  WHERE created_at < now() - p_outbox_max_age;
  GET DIAGNOSTICS v_outbox = ROW_COUNT;

  DELETE FROM mark_tombstones
  WHERE expires_at < p_tombstone_now;
  GET DIAGNOSTICS v_tomb = ROW_COUNT;

  RETURN QUERY SELECT v_idem, v_outbox, v_tomb;
END;
$$;

-- =============================================================================
-- Prune Y history (compact old updates after snapshot)
-- =============================================================================

CREATE OR REPLACE FUNCTION prune_y_history(
  p_slug TEXT,
  p_keep_after_seq BIGINT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM document_y_updates
  WHERE document_slug = p_slug AND seq < p_keep_after_seq;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =============================================================================
-- Dashboard document listing (replaces complex SQLite join)
-- =============================================================================

CREATE OR REPLACE FUNCTION list_dashboard_documents(
  p_user_id INTEGER,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  slug TEXT,
  doc_id TEXT,
  title TEXT,
  share_state share_state,
  owner_id TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  visit_role TEXT,
  last_visited_at TIMESTAMPTZ,
  source TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (d.slug)
    d.slug,
    d.doc_id,
    d.title,
    d.share_state,
    d.owner_id,
    d.created_at,
    d.updated_at,
    v.role AS visit_role,
    v.last_visited_at,
    CASE
      WHEN d.owner_id = p_user_id::text THEN 'owned'
      WHEN v.every_user_id IS NOT NULL THEN 'visited'
      ELSE 'shared'
    END AS source
  FROM documents d
  LEFT JOIN user_document_visits v
    ON v.document_slug = d.slug AND v.every_user_id = p_user_id
  WHERE d.active = true
    AND d.share_state = 'ACTIVE'
    AND (
      d.owner_id = p_user_id::text
      OR v.every_user_id = p_user_id
    )
  ORDER BY d.slug, v.last_visited_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;
