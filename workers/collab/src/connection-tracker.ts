/**
 * In-memory connection tracker for active collab sessions.
 *
 * Tracks which WebSocket connections are open per document slug so we can
 * answer "is anyone editing this document right now?" without hitting the DB.
 * This is safe because the Render worker runs as a single instance.
 */

const connections = new Map<string, Set<string>>();

export function addConnection(slug: string, connectionId: string): void {
  let set = connections.get(slug);
  if (!set) {
    set = new Set();
    connections.set(slug, set);
  }
  set.add(connectionId);
}

export function removeConnection(slug: string, connectionId: string): void {
  const set = connections.get(slug);
  if (!set) return;
  set.delete(connectionId);
  if (set.size === 0) {
    connections.delete(slug);
  }
}

export function getConnectionCount(slug: string): number {
  return connections.get(slug)?.size ?? 0;
}

export function getActiveDocumentSlugs(): string[] {
  return Array.from(connections.keys());
}
