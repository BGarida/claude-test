# Proof SDK Clone — Project Plan

## Overview

Replicate the [EveryInc/proof-sdk](https://github.com/EveryInc/proof-sdk) as a self-hosted collaborative markdown editor deployed on **Vercel** (Next.js) with **Supabase** for persistence and **Render** for the real-time collaboration worker. The system will serve a single org workspace and integrate with **OpenClaw** agents via the HTTP bridge API.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────┐
│                   Vercel (Pro)                   │
│  ┌───────────────────────────────────────────┐  │
│  │         Next.js Monorepo App              │  │
│  │  ┌─────────────┐  ┌───────────────────┐   │  │
│  │  │  Frontend    │  │  API Routes       │   │  │
│  │  │  (Editor UI) │  │  /api/documents   │   │  │
│  │  │  Milkdown    │  │  /api/ops         │   │  │
│  │  │  + Yjs       │  │  /api/bridge      │   │  │
│  │  │  + Plugins   │  │  /api/share       │   │  │
│  │  └─────────────┘  └───────────────────┘   │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────┘
                      │ REST API
          ┌───────────┼───────────────┐
          ▼           ▼               ▼
┌──────────────┐ ┌──────────┐ ┌──────────────────┐
│   Supabase   │ │  Render  │ │  OpenClaw (VPS)  │
│  ┌────────┐  │ │  Worker  │ │                  │
│  │Postgres│  │ │ HocusPoc │ │  AI Agents       │
│  │  + RLS │  │ │ us + Yjs │ │  HTTP Bridge     │
│  └────────┘  │ │ WebSocket│ │  Client          │
│  ┌────────┐  │ │  Server  │ └──────────────────┘
│  │Storage │  │ └──────────┘
│  │(snaps) │  │
│  └────────┘  │
└──────────────┘
```

**Key decisions:**
- **Supabase Postgres** replaces SQLite (closest migration path, RLS for access control)
- **Render worker** runs HocusPocus WebSocket server for real-time Yjs collaboration
- **Next.js API routes** handle all REST endpoints (documents, ops, bridge, share)
- **Single workspace** — no multi-tenant complexity, one org, shared access

---

## Phase 1: Extraction & Analysis

### 1.1 Clone and audit the source
- [ ] Fork/clone `EveryInc/proof-sdk`
- [ ] Inventory all packages: `@proof/core`, `@proof/editor`, `@proof/server`, `@proof/agent-bridge`, `@proof/sqlite`
- [ ] Map dependencies and identify what can be reused as-is vs. needs adaptation
- [ ] Identify all SQLite-specific code that needs Supabase migration

### 1.2 Dependency audit
- [ ] List all npm dependencies and their roles
- [ ] Identify any deprecated or problematic packages
- [ ] Check license compatibility (SDK is open source)
- [ ] Note Vercel serverless constraints (no native modules like `better-sqlite3`, no long-lived processes)

**Deliverable:** Dependency matrix with keep/adapt/replace decisions

---

## Phase 2: Database Design (Supabase)

### 2.1 Schema migration: SQLite → Postgres

Map the existing SQLite schema to Supabase Postgres:

| Original (SQLite)       | New (Supabase Postgres)          | Notes                                    |
|--------------------------|----------------------------------|------------------------------------------|
| `documents` table        | `documents` table                | Add `org_id` column for workspace        |
| `access_tokens` table    | `access_tokens` table            | Link to Supabase auth if desired         |
| `events` table           | `events` table                   | Event log for polling/ack pattern        |
| `marks` (embedded/JSON)  | `marks` table or JSONB column    | JSONB recommended for flexibility        |
| `yjs_state` (binary)     | `yjs_state` BYTEA column         | Yjs document snapshots for persistence   |

### 2.2 Row-Level Security (RLS)
- [ ] Define RLS policies for `ownerSecret`, `accessToken`, and `shareToken` access patterns
- [ ] Single org: all authenticated users can access workspace documents
- [ ] Agents authenticate via bearer tokens (bridge tokens)

### 2.3 Supabase setup
- [ ] Create Supabase project
- [ ] Write migration scripts (SQL)
- [ ] Set up Supabase client in Next.js (`@supabase/ssr`)
- [ ] Configure environment variables

**Deliverable:** Working Supabase schema with RLS policies and migration files

---

## Phase 3: Monorepo Scaffolding

### 3.1 Project structure

```
proof-clone/
├── apps/
│   └── web/                    # Next.js app (Vercel)
│       ├── app/
│       │   ├── page.tsx                # Dashboard / document list
│       │   ├── d/[slug]/page.tsx       # Editor view
│       │   ├── api/
│       │   │   ├── documents/          # Document CRUD routes
│       │   │   ├── ops/                # Comments, suggestions, rewrites
│       │   │   ├── bridge/             # Agent bridge HTTP API
│       │   │   └── share/              # Share link routes
│       │   └── layout.tsx
│       ├── components/
│       │   └── editor/                 # Editor UI components
│       └── lib/
│           ├── supabase/               # Supabase client + queries
│           └── editor/                 # Editor setup + plugins
├── packages/
│   ├── core/                   # Marks, provenance, types (from @proof/core)
│   ├── editor/                 # Milkdown editor runtime (from @proof/editor)
│   ├── agent-bridge/           # Bridge client (from @proof/agent-bridge)
│   └── db/                     # Supabase data access layer (replaces @proof/sqlite)
├── workers/
│   └── collab/                 # HocusPocus WebSocket server (deploys to Render)
│       ├── src/
│       │   ├── index.ts                # HocusPocus server entry
│       │   ├── supabase-persistence.ts # Yjs ↔ Supabase sync
│       │   └── auth.ts                 # Token validation
│       ├── Dockerfile
│       └── package.json
├── supabase/
│   └── migrations/             # SQL migration files
├── turbo.json                  # Turborepo config
├── package.json                # Root workspace
└── vercel.json                 # Vercel deployment config
```

### 3.2 Tooling
- [ ] **Turborepo** for monorepo orchestration (Vercel's own, best integration)
- [ ] **TypeScript** throughout (strict mode)
- [ ] **pnpm** workspaces (or npm — match your preference)
- [ ] ESLint + Prettier

**Deliverable:** Scaffolded monorepo with all packages, apps, and workers directories

---

## Phase 4: Core Packages (Extraction)

### 4.1 `packages/core` — extract from `@proof/core`
- [ ] Copy mark types, colors, provenance sidecar format
- [ ] Copy agent identity utilities
- [ ] Minimal changes — this is pure TypeScript, no runtime dependencies

### 4.2 `packages/editor` — adapt from `@proof/editor`
- [ ] Port Milkdown editor setup and plugin system
- [ ] Port all 24 plugins (comments, marks, suggestions, collab-cursors, agent-cursor, etc.)
- [ ] Port schema extensions (frontmatter, code blocks, proof marks)
- [ ] Port remark-proof-marks plugin
- [ ] Adapt for Next.js (ensure SSR-safe — Milkdown is client-only, use `"use client"` boundaries)

### 4.3 `packages/agent-bridge` — extract from `@proof/agent-bridge`
- [ ] Copy HTTP client factory (`createAgentBridgeClient`)
- [ ] Update base URL to point to your Vercel deployment
- [ ] Ensure all methods work: getState, addComment, addSuggestion, rewrite, presence, etc.

### 4.4 `packages/db` — NEW (replaces `@proof/sqlite`)
- [ ] Implement document CRUD with Supabase client
- [ ] Implement access token management
- [ ] Implement event logging and acknowledgment
- [ ] Implement marks storage (JSONB)
- [ ] Implement Yjs state persistence (for collab worker snapshots)

**Deliverable:** All four packages building and type-checking cleanly

---

## Phase 5: Collaboration Worker (Render)

### 5.1 HocusPocus WebSocket server
- [ ] Set up HocusPocus server with Yjs
- [ ] Implement **Supabase persistence extension** — load/save Yjs document state from Postgres
- [ ] Implement token-based authentication (validate `accessToken` / `ownerSecret` / `shareToken`)
- [ ] Handle connection lifecycle (session management, cleanup)

### 5.2 Communication with Vercel
- [ ] Collab worker reads/writes Yjs state to Supabase (shared database)
- [ ] Next.js API routes read canonical document from same Supabase tables
- [ ] Dual-runtime sync: collab worker merges Yjs changes → Supabase on save
- [ ] Optional: REST callback from worker → Vercel API for event notifications

### 5.3 Render deployment
- [ ] Dockerfile for the worker
- [ ] Render web service config (persistent process, not serverless)
- [ ] Environment variables (Supabase URL, keys, auth secrets)
- [ ] Health check endpoint

**Deliverable:** HocusPocus server running on Render, persisting to Supabase

---

## Phase 6: Next.js App (Vercel)

### 6.1 API routes — port from `server/`

Map the original Express routes to Next.js App Router API routes:

| Original Express Route              | Next.js API Route                          |
|--------------------------------------|--------------------------------------------|
| `POST /documents`                    | `POST /api/documents`                      |
| `GET /documents/:slug/state`         | `GET /api/documents/[slug]/state`          |
| `GET /documents/:slug/snapshot`      | `GET /api/documents/[slug]/snapshot`        |
| `POST /documents/:slug/edit/v2`      | `POST /api/documents/[slug]/edit/v2`       |
| `POST /documents/:slug/ops`          | `POST /api/documents/[slug]/ops`           |
| `POST /documents/:slug/presence`     | `POST /api/documents/[slug]/presence`      |
| `GET /documents/:slug/events/pending`| `GET /api/documents/[slug]/events/pending` |
| `POST /documents/:slug/events/ack`   | `POST /api/documents/[slug]/events/ack`    |
| `GET /documents/:slug/bridge/state`  | `GET /api/bridge/[slug]/state`             |
| `POST /documents/:slug/bridge/*`     | `POST /api/bridge/[slug]/*`                |

### 6.2 Key server logic to port
- [ ] `document-engine.ts` — edit execution with anchor resolution → utility module
- [ ] `canonical-document.ts` — source of truth mutations → utility module  
- [ ] `routes.ts` — endpoint handlers → individual route files
- [ ] `agent-routes.ts` — agent mutation logic → bridge route handlers
- [ ] `bridge.ts` — bridge auth and rate limiting → middleware

### 6.3 Frontend pages
- [ ] `/` — Dashboard: list documents, create new
- [ ] `/d/[slug]` — Editor: Milkdown editor with collaboration
  - Connect to Render WebSocket for Yjs sync
  - Load document state from API
  - Render marks, comments sidebar, suggestions
- [ ] `/d/[slug]/share` — Public share view (read-only or scoped)

### 6.4 Auth
- [ ] Supabase Auth for org members (email/password or SSO)
- [ ] Middleware to protect routes
- [ ] Map Supabase user → document access tokens
- [ ] Agent bridge uses bearer tokens (no Supabase Auth needed)

### 6.5 Rate limiting
- [ ] Implement on bridge routes (60/min unauth, 240/min auth — matching original)
- [ ] Use Vercel KV or Upstash Redis for rate limit counters

**Deliverable:** Fully functional Next.js app on Vercel with all API routes and editor UI

---

## Phase 7: OpenClaw Integration

### 7.1 Agent bridge configuration
- [ ] Ensure bridge API matches the contract in `AGENT_CONTRACT.md`
- [ ] Endpoints your OpenClaw agents will call:
  - `GET /api/bridge/[slug]/state` — read document
  - `GET /api/bridge/[slug]/marks` — read annotations
  - `POST /api/bridge/[slug]/comments` — add comments
  - `POST /api/bridge/[slug]/suggestions` — propose changes
  - `POST /api/bridge/[slug]/rewrite` — full rewrite
  - `POST /api/bridge/[slug]/presence` — agent cursor

### 7.2 OpenClaw hook setup
- [ ] Configure OpenClaw agents with your deployment's base URL
- [ ] Set up bearer token auth for agent requests
- [ ] Test end-to-end: agent reads doc → makes suggestion → appears in editor

### 7.3 Event polling (agent side)
- [ ] Agents poll `GET /api/documents/[slug]/events/pending` for new events
- [ ] Acknowledge processed events via `POST /api/documents/[slug]/events/ack`
- [ ] This enables reactive agent behavior (respond to human edits/comments)

**Deliverable:** OpenClaw agents reading/writing documents through the bridge API

---

## Phase 8: Testing

### 8.1 Port critical tests
- [ ] Bridge auth tests
- [ ] Document CRUD tests
- [ ] Mark operations tests (add, resolve, accept, reject)
- [ ] Edit V2 with revision locking tests
- [ ] Collab session lifecycle tests

### 8.2 Integration tests
- [ ] End-to-end: create doc → edit via API → verify in DB
- [ ] End-to-end: agent bridge → add comment → verify mark
- [ ] WebSocket collab: connect → edit → verify sync

### 8.3 Test infrastructure
- [ ] Vitest (aligns with Vite/Next.js ecosystem)
- [ ] Supabase local dev (`supabase start` for local Postgres)
- [ ] CI via GitHub Actions

**Deliverable:** Test suite passing in CI

---

## Phase 9: Deployment

### 9.1 Vercel
- [ ] Connect monorepo to Vercel project
- [ ] Configure root directory → `apps/web`
- [ ] Set environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `COLLAB_WORKER_URL` (Render WebSocket URL)
  - `BRIDGE_AUTH_SECRET`
- [ ] Configure Turborepo remote caching on Vercel
- [ ] Set up preview deployments for PRs

### 9.2 Render
- [ ] Deploy collab worker as a Web Service (not static/cron)
- [ ] Set environment variables (Supabase credentials)
- [ ] Configure auto-deploy from monorepo `workers/collab` directory
- [ ] Set up health checks

### 9.3 Supabase
- [ ] Run migrations on production project
- [ ] Enable RLS policies
- [ ] Configure auth providers (email, or SSO for your org)

### 9.4 DNS / Domain
- [ ] Point custom domain to Vercel
- [ ] Configure WebSocket subdomain if needed (e.g., `ws.yourdomain.com` → Render)

**Deliverable:** Live production deployment

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Milkdown SSR issues in Next.js | Editor won't render | Dynamic import with `ssr: false`, `"use client"` boundaries |
| Yjs state divergence between Render worker and Supabase | Data loss | Periodic snapshots, conflict-free merge on reconnect |
| Vercel serverless cold starts on API routes | Slow agent responses | Enable Vercel Functions with `maxDuration: 30` (Pro) |
| HocusPocus ↔ Supabase persistence lag | Stale reads from API | Read from Yjs state via worker when collab is active, fall back to DB |
| Rate limiting without Redis | Bridge abuse | Use Upstash Redis (free tier) or Vercel KV |

---

## Implementation Order (Recommended)

```
Week 1:  Phase 1 (Extraction) + Phase 2 (Database) + Phase 3 (Scaffold)
Week 2:  Phase 4 (Core packages) + Phase 5 (Collab worker)
Week 3:  Phase 6 (Next.js app — API routes + editor UI)
Week 4:  Phase 7 (OpenClaw integration) + Phase 8 (Testing)
Week 5:  Phase 9 (Deploy) + polish
```

Each phase can start implementation as soon as its dependencies are ready. Phases 4 and 5 can run in parallel. Phase 6 depends on 4 and 5. Phase 7 depends on 6.
