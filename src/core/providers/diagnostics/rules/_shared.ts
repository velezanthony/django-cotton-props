/**
 * Regex constants used by more than one parity rule. Per-rule patterns
 * stay inside their own file — only patterns referenced from multiple
 * rules live here.
 */

/** `<c-vars [...]>` matcher used by enum-default, missing-cvars, and
 *  dynamic-prefix to find the c-vars body for cross-checks. */
export const CVARS_TAG_PARITY_RE = /<c-vars\b([^>]*?)\s*\/?>/i;

/** `| default:"..."` or `| default:literal` — captures the value in
 *  group 1 (quoted) or 2 (bare). Used by type-default-mismatch and
 *  enum-default-out-of-range. */
export const RAW_DEFAULT_RE = /\|\s*default\s*:\s*(?:"([^"]*)"|(\S+))/;

/** `[:?]NAME:` — captures the optional dynamic prefix and the clean
 *  name. Used by missing-description and dynamic-prefix-mismatch. */
export const HEAD_DYNAMIC_RE = /^\s*(:?)([\w-]+):/;
