// Unified marks system (comments, suggestions, authored marks, approvals, flags)
export * from './formats/marks.js';

// Legacy provenance format (migration helpers, comment helpers)
export * from './formats/provenance-sidecar.js';

// Remark plugin for proof mark spans in markdown
export * from './formats/remark-proof-marks.js';

// Agent identity utilities
export * from './shared/agent-identity.js';

// Anchor target text utilities (quote normalization, markdown stripping)
export * from './shared/anchor-target-text.js';

export const PACKAGE_NAME = "@proof-clone/core";
