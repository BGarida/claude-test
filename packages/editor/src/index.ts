/**
 * @proof-clone/editor
 *
 * Proof editor package — ProseMirror/Milkdown editor with proof marks,
 * suggestions, comments, authorship tracking, and agent cursor support.
 *
 * This is a clean public API module. The upstream 10K-line index.ts is NOT
 * copied here; bridge/collab/agent integration will be added later.
 */

// ============================================================================
// Re-exports: Marks Plugin API
// ============================================================================

export {
  // Plugin state & keys
  marksPluginKey,
  marksCtx,
  marksPlugin,
  marksPlugins,
  type MarksPluginState,
  type ResolvedMark,

  // Mark access
  getMarks,
  getActiveMarkId,
  getComposeAnchorRange,
  getMarkMetadata,
  getMarkMetadataForDisk,
  getMarkMetadataWithQuotes,
  setMarkMetadata,

  // Mark operations
  approve,
  unapprove,
  flag,
  unflag,
  comment,
  reply,
  resolve,
  unresolve,
  suggestInsert,
  suggestDelete,
  suggestReplace,
  modifySuggestionContent,
  accept,
  reject,
  acceptAll,
  rejectAll,
  deleteMark,

  // Authored marks
  addAuthoredMark,
  setAuthoredMark,
  getAuthorshipStats,

  // Active mark
  setActiveMark,
  setComposeAnchorRange,

  // Remote sync
  applyRemoteMarks,
  mergePendingServerMarks,

  // Utilities
  buildSuggestionMetadata,
  setDefaultMarkdownParser,
  setEventCallback,
  coalesceMarks,
  updateMarksAfterEdit,
  resolveMarks,
  rangeCrossesTableCellBoundary,

  // Debug
  debugResolveRangeWithValidation,
  debugAnalyzeReplace,

  // Re-exports from @proof-clone/core (via marks plugin)
  type Mark,
  type MarkKind,
  type MarkRange,
  type CommentData,
  type InsertData,
  type DeleteData,
  type ReplaceData,
  type StoredMark,
  extractMarks,
  embedMarks,
  hasMarks,
  getMarksByKind,
  getPendingSuggestions,
  getUnresolvedComments,
  getAuthoredMarks,
  getHumanAuthored,
  getAIAuthored,
  getActiveMarks,
  getOrphanedMarks,
  findMark,
  isHuman,
  isAI,
  getActorName,
  createAuthored,
  coalesceAuthoredMarks,
  calculateAuthorshipStats,
  resolveQuote,
} from './plugins/marks';

// ============================================================================
// Re-exports: Suggestions Plugin API
// ============================================================================

export {
  suggestionsPluginKey,
  suggestionsCtx,
  suggestionsPlugin,
  suggestionsPlugins,
  type SuggestionState,
  wrapTransactionForSuggestions,
  isSuggestionsEnabled,
  enableSuggestions,
  disableSuggestions,
  toggleSuggestions,
} from './plugins/suggestions';

// ============================================================================
// Re-exports: Batch Executor
// ============================================================================

export {
  executeBatch,
  type BatchOperation,
  type BatchOperationResult,
  type BatchResult,
} from './batch-executor';

// ============================================================================
// Re-exports: Actor Utilities
// ============================================================================

export {
  normalizeActor,
  setCurrentActor,
  getCurrentActor,
} from './actor';

// ============================================================================
// Re-exports: Comments Plugin
// ============================================================================

export {
  commentsPluginKey,
  commentsCtx,
  commentsPlugin,
  commentsPlugins,
} from './plugins/comments';

// ============================================================================
// Re-exports: Other Plugins
// ============================================================================

export { authoredTrackerPlugin } from './plugins/authored-tracker';
export { marksSyncPlugin } from './plugins/marks-sync';
export { agentCursorPlugin, agentCursorCtx, setAgentCursor, setAgentSelection, clearAgentCursor } from './plugins/agent-cursor';
export { placeholderPlugin } from './plugins/placeholder';
export { taskCheckboxesPlugin } from './plugins/task-checkboxes';
export { keybindingsPlugin } from './plugins/keybindings';
export { findHighlightsPlugin, setFindHighlights, clearFindHighlights } from './plugins/find-highlights';
export { heatmapPlugin, heatmapCtx } from './plugins/heatmap-decorations';
export { tableKeyboardPlugin } from './plugins/table-keyboard';
export { mermaidDiagramsPlugin } from './plugins/mermaid-diagrams';
export { collabCursorBuilder, collabSelectionBuilder } from './plugins/collab-cursors';

// ============================================================================
// Re-exports: Schema
// ============================================================================

export { proofMarkPlugins } from './schema/proof-marks';
export { codeBlockExtPlugins } from './schema/code-block-ext';
export { frontmatterSchema } from './schema/frontmatter';
export { suggestionMarkPlugins } from './schema/suggestion-marks';
export { remarkFrontmatterPlugin } from './schema/remark-frontmatter-plugin';
export { remarkProofMarksPlugin } from './schema/remark-proof-marks-plugin';

// ============================================================================
// Re-exports: Utilities
// ============================================================================

export { resolveQuoteRange, buildTextIndex, getTextForRange } from './utils/text-range';
export { computeLineDiff, computeChangeStats, classifyChangeMode } from './utils/diff';
export { resolveSelector, resolveSelectorRange, hasHeading } from './utils/selectors';

// ============================================================================
// Factory: initProofEditor
// ============================================================================

import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { cursor } from '@milkdown/plugin-cursor';
import { clipboard } from '@milkdown/plugin-clipboard';
import { listener, listenerCtx } from '@milkdown/plugin-listener';

import { proofMarkPlugins } from './schema/proof-marks';
import { codeBlockExtPlugins } from './schema/code-block-ext';
import { frontmatterSchema } from './schema/frontmatter';
import { suggestionMarkPlugins } from './schema/suggestion-marks';
import { remarkFrontmatterPlugin } from './schema/remark-frontmatter-plugin';
import { remarkProofMarksPlugin } from './schema/remark-proof-marks-plugin';

import { marksPlugins } from './plugins/marks';
import { suggestionsPlugins } from './plugins/suggestions';
import { commentsPlugins } from './plugins/comments';
import { authoredTrackerPlugin } from './plugins/authored-tracker';
import { placeholderPlugin } from './plugins/placeholder';
import { taskCheckboxesPlugin } from './plugins/task-checkboxes';
import { keybindingsPlugin } from './plugins/keybindings';
import { findHighlightsPlugin } from './plugins/find-highlights';
import { tableKeyboardPlugin } from './plugins/table-keyboard';
import { agentCursorPlugin, agentCursorCtx } from './plugins/agent-cursor';

export interface ProofEditorConfig {
  /** The DOM element to mount the editor into */
  element: HTMLElement;
  /** Initial markdown content */
  defaultValue?: string;
  /** Callback invoked when the document content changes */
  onContentChange?: (markdown: string) => void;
}

export interface ProofEditorInstance {
  /** The Milkdown editor instance */
  editor: Editor;
  /** Destroy the editor and clean up resources */
  destroy: () => void;
}

/**
 * Create a configured Milkdown editor with all proof plugins.
 *
 * This is a minimal factory for standalone use. For collab/bridge/agent
 * integration, compose the plugins directly with Milkdown's Editor API.
 */
export async function initProofEditor(config: ProofEditorConfig): Promise<ProofEditorInstance> {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, config.element);
      if (config.defaultValue) {
        ctx.set(defaultValueCtx, config.defaultValue);
      }
      if (config.onContentChange) {
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          config.onContentChange!(markdown);
        });
      }
    })
    // Presets
    .use(commonmark)
    .use(gfm)
    // Core plugins
    .use(history)
    .use(cursor)
    .use(clipboard)
    .use(listener)
    // Proof mark schemas
    .use(proofMarkPlugins)
    .use(codeBlockExtPlugins)
    .use(frontmatterSchema)
    .use(suggestionMarkPlugins)
    .use(remarkFrontmatterPlugin)
    .use(remarkProofMarksPlugin)
    // Proof editor plugins
    .use(marksPlugins)
    .use(suggestionsPlugins)
    .use(commentsPlugins)
    .use(authoredTrackerPlugin)
    .use(agentCursorCtx)
    .use(agentCursorPlugin)
    .use(placeholderPlugin)
    .use(taskCheckboxesPlugin)
    .use(keybindingsPlugin)
    .use(findHighlightsPlugin)
    .use(tableKeyboardPlugin)
    .create();

  return {
    editor,
    destroy: () => {
      editor.destroy();
    },
  };
}
