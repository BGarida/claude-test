# Phase 1: Extraction & Analysis Report

## 1. Codebase Overview

| Metric | Count |
|--------|-------|
| Total TypeScript files | 294 |
| Test files | 138 |
| Server code (lines) | 40,666 |
| Editor plugins | 24 files, 10,695 lines |
| Packages | 6 (5 in packages/ + 1 example app) |

---

## 2. Package Inventory

### `@proof/core` (`packages/doc-core/`)
- **Purpose**: Shared types, mark definitions, colors, provenance specs, agent identity
- **Portability**: ✅ Pure TypeScript, zero runtime deps — **extract as-is**
- **Exports**: Mark interfaces, color constants, provenance sidecar specs, agent identity utils

### `@proof/editor` (`packages/doc-editor/`)
- **Purpose**: Milkdown editor runtime, plugin system
- **Portability**: ⚠️ Client-side only (DOM-dependent) — needs `"use client"` in Next.js
- **Exports**: `proofEditor` singleton, plugin functions (comments, marks, suggestions), batch executor
- **Internal files**: 24 plugins, 6 schema files, 3 utils, several share-related modules

### `@proof/server` (`packages/doc-server/`)
- **Purpose**: Express router factories for documents, shares, agents, bridge
- **Portability**: 🔄 Express-coupled — **rewrite as Next.js API routes**
- **Exports**: `mountProofSdkRoutes()`, `createDocumentRouter()`, `createShareRouter()`, `createAgentRouter()`, `createBridgeRouter()`

### `@proof/agent-bridge` (`packages/agent-bridge/`)
- **Purpose**: HTTP client for external agents to interact with documents
- **Portability**: ✅ Pure HTTP client — **extract as-is**, just update base URL
- **Exports**: `createAgentBridgeClient()`, methods: getState, addComment, addSuggestion, rewrite, presence, etc.

### `@proof/sqlite` (`packages/doc-store-sqlite/`)
- **Purpose**: SQLite adapter, thin wrapper re-exporting from `server/db.ts`
- **Portability**: ❌ **Replace entirely** with Supabase data access layer
- **Exports**: `createSqliteDocumentStore()` + 9 re-exported functions

### `proof-example` (`apps/example/`)
- **Purpose**: Reference app showing agent bridge usage
- **Action**: Use as integration test reference, don't deploy

---

## 3. Server File Inventory (40,666 lines)

### Critical files (must port):

| File | Lines | Purpose | Migration |
|------|-------|---------|-----------|
| `collab.ts` | 12,476 | Yjs/HocusPocus runtime, session management | → Render worker |
| `agent-routes.ts` | 4,010 | Agent mutation handlers | → Next.js API routes |
| `db.ts` | 3,857 | SQLite data layer (19 tables, 100+ functions) | → Supabase `packages/db` |
| `document-engine.ts` | 2,692 | Edit execution, anchor resolution | → Shared utility |
| `routes.ts` | 2,143 | Main API endpoint handlers | → Next.js API routes |
| `canonical-document.ts` | 1,699 | Source of truth mutations | → Shared utility |
| `agent-edit-v2.ts` | 1,156 | Block-level edit operations | → Next.js API routes |
| `bridge.ts` | 759 | Bridge auth + rate limiting | → Next.js middleware |
| `share-web-routes.ts` | 656 | Public share views | → Next.js pages/API |
| `ws.ts` | 554 | WebSocket management | → Render worker |

### Supporting files (smaller, portable logic):

| File | Lines | Purpose | Migration |
|------|-------|---------|-----------|
| `anchor-resolver.ts` | 458 | Text anchor resolution | ✅ Extract as-is |
| `proof-mark-rehydration.ts` | 399 | Mark rehydration from markdown | ✅ Extract as-is |
| `agent-edit-ops.ts` | 337 | Agent edit operation builders | ✅ Extract as-is |
| `mutation-coordinator.ts` | ~300 | Mutation sequencing | ✅ Extract as-is |
| `collab-mutation-coordinator.ts` | 438 | Collab-aware mutation coordination | → Render worker |
| `milkdown-headless.ts` | ~300 | Server-side markdown parsing | ✅ Extract as-is |
| `proof-span-strip.ts` | 459 | Strip proof spans from markdown | ✅ Extract as-is |
| `rate-limiter.ts` | ~200 | Rate limiting logic | 🔄 Adapt for Vercel KV |
| `bridge-auth-policy.ts` | ~200 | Bridge authentication | ✅ Extract as-is |
| `slug.ts` | ~50 | Slug generation | ✅ Extract as-is |
| `share-types.ts` | ~80 | Share role types | ✅ Extract as-is |
| `share-access.ts` | ~150 | Share access resolution | ✅ Extract as-is |
| `share-state.ts` | ~100 | Share state management | ✅ Extract as-is |
| `share-preview.ts` | 805 | OG image/snapshot generation | 🔄 Move to Render (native deps) |
| `bug-reporting.ts` | 2,202 | Error reporting | ⏭️ Optional, skip initially |
| `metrics.ts` | 1,133 | Observability/metrics | ⏭️ Optional, skip initially |
| `telemetry.ts` | ~200 | Telemetry | ⏭️ Optional, skip initially |

---

## 4. Database Schema (SQLite → Supabase Postgres)

### 19 Tables to migrate:

#### Core document tables:
```sql
-- 1. documents (primary table)
documents (
  slug TEXT PRIMARY KEY,
  doc_id TEXT UNIQUE,
  title TEXT,
  markdown TEXT NOT NULL,
  marks TEXT NOT NULL DEFAULT '{}',          -- JSON object
  revision INTEGER NOT NULL DEFAULT 1,
  y_state_version INTEGER NOT NULL DEFAULT 0,
  share_state TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE/PAUSED/REVOKED/DELETED
  access_epoch INTEGER NOT NULL DEFAULT 1,
  collab_bootstrap_epoch INTEGER NOT NULL DEFAULT 0,
  live_collab_seen_at TEXT,
  live_collab_access_epoch INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  owner_id TEXT,
  owner_secret TEXT,
  owner_secret_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
)

-- 2. document_projections (cached derived state)
document_projections (
  document_slug TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  y_state_version INTEGER NOT NULL DEFAULT 0,
  markdown TEXT NOT NULL,
  marks_json TEXT NOT NULL DEFAULT '{}',
  plain_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  health TEXT NOT NULL DEFAULT 'healthy',
  health_reason TEXT
)

-- 3. document_blocks (block-level structure)
document_blocks (
  document_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  node_type TEXT NOT NULL,
  attrs_json TEXT NOT NULL DEFAULT '{}',
  markdown_hash TEXT NOT NULL,
  text_preview TEXT NOT NULL DEFAULT '',
  created_revision INTEGER NOT NULL,
  last_seen_revision INTEGER NOT NULL,
  retired_revision INTEGER
)
```

#### Access control:
```sql
-- 4. document_access (token-based auth)
document_access (
  token_id TEXT PRIMARY KEY,
  document_slug TEXT NOT NULL,
  role TEXT NOT NULL,            -- viewer/commenter/editor
  secret_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
)

-- 5. share_auth_sessions (SSO/auth sessions)
share_auth_sessions (
  session_token_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  every_user_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  subscriber INTEGER NOT NULL DEFAULT 1,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  ...session fields
)
```

#### Event system:
```sql
-- 6. events (legacy event log)
events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_slug TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
)

-- 7. document_events (new event log with revision tracking)
document_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_slug TEXT NOT NULL,
  document_revision INTEGER,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,
  actor TEXT NOT NULL,
  idempotency_key TEXT,
  mutation_route TEXT,
  tombstone_revision INTEGER,
  created_at TEXT NOT NULL,
  acked_at TEXT,
  acked_by TEXT
)

-- 8. server_incident_events (error logging)
server_incident_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT, slug TEXT,
  subsystem TEXT NOT NULL, level TEXT NOT NULL,
  event_type TEXT NOT NULL, message TEXT NOT NULL,
  data_json TEXT NOT NULL, created_at TEXT NOT NULL
)
```

#### Idempotency & mutation tracking:
```sql
-- 9. idempotency_keys (legacy)
-- 10. mutation_idempotency (new, with state machine)
-- 11. mutation_outbox (outbox pattern for reliable mutations)
-- 12. mark_tombstones (soft-deleted marks with TTL)
```

#### Yjs collaboration state:
```sql
-- 13. document_y_updates (incremental Yjs updates)
document_y_updates (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  document_slug TEXT NOT NULL,
  update_blob BLOB NOT NULL,
  source_actor TEXT,
  created_at TEXT NOT NULL
)

-- 14. document_y_snapshots (periodic Yjs snapshots)
document_y_snapshots (
  document_slug TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_blob BLOB NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (document_slug, version)
)
```

#### User & workspace:
```sql
-- 15. active_collab_connections (live connection tracking)
-- 16. user_document_visits (access history)
-- 17. library_documents (user's library)
-- 18. maintenance_runs (migration/maintenance tracking)
-- 19. system_metadata (key-value config store)
```

### Postgres migration notes:
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL` or `BIGSERIAL`
- `TEXT` dates → `TIMESTAMPTZ` (use native Postgres timestamps)
- `BLOB` → `BYTEA` (for Yjs state)
- `marks TEXT` → `JSONB` (enables querying marks)
- Add `org_id` column to `documents` for workspace scoping
- RLS policies replace the manual access checking in `resolveDocumentAccess()`

---

## 5. Dependency Audit

### KEEP (works as-is in Next.js/Vercel):

| Package | Role |
|---------|------|
| `@milkdown/core`, `/kit`, `/plugin-*`, `/preset-*`, `/theme-nord` | Editor framework (client-side) |
| `yjs` | CRDT library |
| `y-prosemirror` | Yjs ↔ ProseMirror bridge |
| `y-indexeddb` | Client-side Yjs persistence |
| `y-websocket` | WebSocket Yjs provider |
| `@hocuspocus/provider` | Client-side collab provider |
| `@handlewithcare/prosemirror-suggest-changes` | Track changes |
| `zod` | Schema validation |
| `remark-frontmatter`, `remark-gfm` | Markdown parsing |
| `prismjs` | Syntax highlighting |
| `@fontsource/ibm-plex-sans` | Font |
| `beautiful-mermaid` | Mermaid diagrams |
| `web-haptics` | Browser vibration API |
| `wink-nlp`, `wink-eng-lite-web-model` | NLP for authorship (⚠️ check license) |

### REPLACE (incompatible with Vercel serverless):

| Package | Reason | Replacement |
|---------|--------|-------------|
| `better-sqlite3` | Native C++ module | Supabase Postgres (`@supabase/supabase-js`) |
| `express` | Server framework | Next.js App Router API routes |
| `@hocuspocus/server` | Long-lived WebSocket process | Deploy on Render (keep same package) |
| `@resvg/resvg-js` | Native Rust module | Move to Render, or use `@vercel/og` |

### ADAPT (works with config changes):

| Package | Notes |
|---------|-------|
| `@aws-sdk/client-s3` | Works on Vercel, configure env vars; or use Supabase Storage |
| `satori` | Works but slow on serverless; consider Render for heavy generation |
| `ws` | Keep on Render worker only |

### DROP (not needed):

| Package | Reason |
|---------|--------|
| `@types/better-sqlite3` | Replacing SQLite |
| `@types/express` | Replacing Express |
| `tsx` | Dev only; Next.js handles TS natively |
| `vite` | Replace with Next.js bundling |

---

## 6. Portability Classification

### ✅ Extract as-is (pure logic, no runtime coupling):
- `packages/doc-core/` — all mark types, colors, provenance
- `packages/agent-bridge/` — HTTP client
- `server/anchor-resolver.ts` — anchor resolution
- `server/proof-mark-rehydration.ts` — mark rehydration
- `server/agent-edit-ops.ts` — edit operation builders
- `server/milkdown-headless.ts` — server-side parsing
- `server/proof-span-strip.ts` — span stripping
- `server/bridge-auth-policy.ts` — auth logic
- `server/slug.ts`, `share-types.ts`, `share-access.ts`, `share-state.ts`
- `server/canonical-document.ts` — after replacing db imports
- `server/document-engine.ts` — after replacing db imports
- `server/rewrite-validation.ts`, `rewrite-policy.ts`
- `src/shared/` — all shared utilities
- `src/formats/` — marks format, provenance sidecar
- `src/editor/` — entire editor (client-side, `"use client"`)

### 🔄 Rewrite (framework-coupled):
- `server/routes.ts` → Next.js API route handlers
- `server/agent-routes.ts` → Next.js API route handlers  
- `server/bridge.ts` → Next.js middleware + API routes
- `server/share-web-routes.ts` → Next.js pages
- `server/rate-limiter.ts` → Adapt for Upstash Redis / Vercel KV
- `server/db.ts` → New Supabase data access layer
- `packages/doc-server/` → New Next.js route organization
- `packages/doc-store-sqlite/` → New `packages/db` with Supabase

### → Render worker:
- `server/collab.ts` — full collab runtime (12,476 lines)
- `server/ws.ts` — WebSocket management
- `server/collab-mutation-coordinator.ts`
- `server/share-preview.ts` (uses `@resvg/resvg-js`)
- `server/snapshot.ts`, `agent-snapshot.ts`

### ⏭️ Skip initially (optional/observability):
- `server/bug-reporting.ts` (2,202 lines)
- `server/metrics.ts` (1,133 lines)
- `server/telemetry.ts`
- `server/observability.ts`
- `server/incident-tracing.ts`
- `server/homepage-script.ts`

---

## 7. Risk Assessment

### High risk:
1. **`collab.ts` is 12,476 lines** — the largest and most complex file. Moving to Render worker requires careful extraction of its Supabase persistence hooks.
2. **`db.ts` has 100+ exported functions across 19 tables** — the Supabase rewrite is the single largest piece of work.
3. **Yjs state synchronization** — the dual-runtime model (canonical DB + live Yjs) must stay in sync between Vercel API and Render worker.

### Medium risk:
4. **Milkdown SSR** — the editor is DOM-dependent; must be dynamically imported with `ssr: false`.
5. **`wink-nlp` licensing** — verify commercial use is allowed before including.
6. **HocusPocus version compatibility** — ensure client provider matches server version.

### Low risk:
7. Pure logic extraction (`anchor-resolver`, `proof-mark-rehydration`, etc.) — copy-paste with minimal changes.
8. Agent bridge client — just needs base URL update.

---

## 8. Recommended Extraction Order

```
1. packages/doc-core          → copy as-is
2. src/formats/               → copy as-is  
3. src/shared/                → copy as-is
4. packages/agent-bridge      → copy, update URL
5. server/db.ts types only    → extract interfaces to packages/db
6. server/ pure logic files   → copy anchor-resolver, proof-mark-rehydration, etc.
7. src/editor/                → copy, add "use client"
8. server/db.ts functions     → rewrite as Supabase queries (BIGGEST TASK)
9. server/collab.ts           → extract to Render worker
10. server/routes.ts + agent-routes.ts → rewrite as Next.js API routes
```

This order minimizes blocked dependencies — each step builds on the previous ones.
