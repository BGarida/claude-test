/**
 * HocusPocus Supabase persistence extension.
 *
 * Syncs Yjs document state to/from Supabase using:
 *   - document_y_snapshots  (compacted state blobs)
 *   - document_y_updates    (incremental update log)
 *   - documents             (canonical markdown)
 */

import * as Y from 'yjs';
import {
  getLatestYSnapshot,
  getYUpdatesAfter,
  getDocumentBySlug,
  appendYUpdate,
  saveYSnapshot,
  updateDocument,
  updateYStateBlob,
  pruneYHistory,
} from '@proof-clone/db';

const SNAPSHOT_INTERVAL = parseInt(
  process.env.SNAPSHOT_INTERVAL || '50',
  10,
);

/** Per-document counter of updates since the last snapshot. */
const updateCounters = new Map<string, number>();

/**
 * Returns a HocusPocus-compatible extension object that persists Yjs
 * document state to Supabase.
 */
export function createPersistenceExtension() {
  return {
    // ── Load ────────────────────────────────────────────────────────────────

    async onLoadDocument(data: {
      documentName: string;
      document: Y.Doc;
    }): Promise<void> {
      const { documentName, document } = data;

      try {
        // 1. Try loading the latest versioned snapshot.
        const snapshot = await getLatestYSnapshot(documentName);

        if (snapshot) {
          Y.applyUpdate(document, snapshot.snapshot);

          // 2. Apply incremental updates recorded after that snapshot.
          //    The snapshot `version` stores the seq number at snapshot time.
          const updates = await getYUpdatesAfter(
            documentName,
            snapshot.version,
          );
          for (const u of updates) {
            Y.applyUpdate(document, u.update_blob);
          }
        } else {
          // No Yjs state — bootstrap from the canonical markdown.
          const doc = await getDocumentBySlug(documentName);
          if (doc) {
            const yText = document.getText('default');
            if (yText.length === 0 && doc.markdown) {
              yText.insert(0, doc.markdown);
            }
          }
        }
      } catch (err) {
        console.error(
          `[persistence] Failed to load document "${documentName}":`,
          err,
        );
        // Let HocusPocus proceed with an empty doc rather than crashing.
      }

      // Reset the update counter for this document.
      updateCounters.set(documentName, 0);
    },

    // ── Store ───────────────────────────────────────────────────────────────

    async onStoreDocument(data: {
      documentName: string;
      document: Y.Doc;
    }): Promise<void> {
      const { documentName, document } = data;

      try {
        // Encode the full state as a single update and persist it.
        const update = Y.encodeStateAsUpdate(document);
        const seq = await appendYUpdate(documentName, update);

        // Increment the per-document counter.
        const count = (updateCounters.get(documentName) ?? 0) + 1;
        updateCounters.set(documentName, count);

        // Every SNAPSHOT_INTERVAL updates, create a compacted snapshot.
        if (count >= SNAPSHOT_INTERVAL) {
          const stateBlob = Y.encodeStateAsUpdate(document);

          await saveYSnapshot(documentName, seq, stateBlob);
          await updateYStateBlob(documentName, stateBlob);

          // Write canonical markdown back to the documents table.
          const markdown = document.getText('default').toString();
          await updateDocument(documentName, {
            markdown,
            y_state_version: seq,
          } as any);

          // Prune old incremental updates covered by the snapshot.
          await pruneYHistory(documentName, seq);

          // Reset counter.
          updateCounters.set(documentName, 0);

          console.log(
            `[persistence] Snapshot created for "${documentName}" at seq ${seq}`,
          );
        }
      } catch (err) {
        console.error(
          `[persistence] Failed to store document "${documentName}":`,
          err,
        );
      }
    },

    // ── Disconnect ──────────────────────────────────────────────────────────

    async onDisconnect(data: {
      documentName: string;
      document: Y.Doc;
      clientsCount: number;
    }): Promise<void> {
      const { documentName, document, clientsCount } = data;

      // Last client leaving — flush a final snapshot so the next load is fast.
      if (clientsCount <= 1) {
        try {
          const stateBlob = Y.encodeStateAsUpdate(document);
          const seq = await appendYUpdate(documentName, stateBlob);
          await saveYSnapshot(documentName, seq, stateBlob);
          await updateYStateBlob(documentName, stateBlob);

          const markdown = document.getText('default').toString();
          await updateDocument(documentName, {
            markdown,
            y_state_version: seq,
          } as any);

          await pruneYHistory(documentName, seq);
          updateCounters.delete(documentName);

          console.log(
            `[persistence] Final snapshot for "${documentName}" at seq ${seq}`,
          );
        } catch (err) {
          console.error(
            `[persistence] Failed to store final snapshot for "${documentName}":`,
            err,
          );
        }
      }
    },
  };
}
