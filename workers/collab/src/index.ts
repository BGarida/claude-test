/**
 * HocusPocus collaboration worker — entry point.
 *
 * Runs an HTTP server with a HocusPocus WebSocket upgrade handler and a
 * simple /health endpoint for Render health checks.
 */

import http from 'http';
import { Server } from '@hocuspocus/server';
import { createPersistenceExtension } from './persistence';
import { createAuthExtension } from './auth';
import {
  addConnection,
  removeConnection,
  getConnectionCount,
  getActiveDocumentSlugs,
} from './connection-tracker';

const PORT = parseInt(process.env.PORT || '8080', 10);

// ── HocusPocus server ────────────────────────────────────────────────────────

const hocuspocus = Server.configure({
  name: 'proof-collab',
  // Debounce store calls so we don't write on every keystroke.
  debounce: 2000,
  maxDebounce: 10000,
  // Quiet mode — we handle our own logging.
  quiet: true,

  extensions: [
    createAuthExtension() as any,
    createPersistenceExtension() as any,
  ],

  async onConnect(data) {
    const slug = data.documentName;
    const connId =
      (data as any).socketId ??
      Math.random().toString(36).slice(2);
    addConnection(slug, String(connId));
    (data.context as Record<string, unknown>).__connId = String(connId);
    console.log(
      `[collab] connect  slug=${slug} connections=${getConnectionCount(slug)}`,
    );
    return data;
  },

  async onDisconnect(data) {
    const slug = data.documentName;
    const connId = (data.context as Record<string, unknown>).__connId as string;
    if (connId) {
      removeConnection(slug, connId);
    }
    console.log(
      `[collab] disconnect slug=${slug} connections=${getConnectionCount(slug)}`,
    );
  },
});

// ── HTTP server ──────────────────────────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
  // Health check endpoint.
  if (req.method === 'GET' && req.url === '/health') {
    const activeDocs = getActiveDocumentSlugs();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        activeDocuments: activeDocs.length,
        uptime: process.uptime(),
      }),
    );
    return;
  }

  // Everything else is 404.
  res.writeHead(404);
  res.end('Not found');
});

// Let HocusPocus handle WebSocket upgrades.
httpServer.on('upgrade', (request, socket, head) => {
  hocuspocus.handleUpgrade(request, socket, head);
});

httpServer.listen(PORT, () => {
  console.log(`[collab] HocusPocus server listening on port ${PORT}`);
  console.log(`[collab] Health check: http://localhost:${PORT}/health`);
});
