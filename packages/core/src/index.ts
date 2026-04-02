// TODO: Define mark types (comments, suggestions, rewrites)
// These will be shared across the editor, bridge, and API layers.

export type MarkType = "comment" | "suggestion" | "rewrite";

export interface Mark {
  id: string;
  type: MarkType;
  // TODO: Add full mark schema from upstream
}

export const PACKAGE_NAME = "@proof-clone/core";
