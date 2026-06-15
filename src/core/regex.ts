/**
 * Canonical Cotton tag regexes — every provider that needs to scan templates
 * for `<c-...>` patterns goes through one of these factories.
 *
 * Why factories instead of shared constants: regexes with the `/g` flag
 * carry mutable `lastIndex` state. If two providers shared the same
 * RegExp instance, one's mid-iteration `exec()` would corrupt the other's
 * cursor. Factories hand out a fresh instance per call, so the state stays
 * local to the caller.
 *
 * The patterns themselves match every shape Cotton accepts — multi-line
 * tag declarations included, since `[^>]` and `[\s\S]` both cross newlines
 * in JavaScript.
 */

/**
 * Opening tag for any Cotton component: `<c-NAME [attrs] [/]>`.
 *
 * Capture groups:
 *   [1] — tag name (e.g. `atoms.button`, `component`, `vars`)
 *   [2] — attribute string with its leading whitespace (`` if no attrs)
 *   [3] — `'/'` when self-closing, `undefined` otherwise
 *
 * Built-in tags (`vars`, `slot`, `component`) are matched by this same
 * pattern — callers that want to skip them check `BUILTIN_TAGS.includes(name)`.
 */
export function cottonTagOpenRe(): RegExp {
    // The attrs body uses `[^>]*?` (non-greedy) so the trailing `\s*(\/)?`
    // can claim the leading `/` of a self-closing tag. A greedy body would
    // swallow the `/` and group [3] would always be `undefined`.
    return /<c-([\w.-]+)((?:\s[^>]*?)?)\s*(\/)?>/g;
}

/**
 * Opening tag for the `<c-component>` dispatcher specifically.
 *
 * Capture groups:
 *   [1] — attribute string (multi-line capable, `` if no attrs)
 *
 * Used by the dispatch-aware providers (hover, definition, references,
 * usage-index) to find every dispatch site in a document.
 */
export function cottonComponentTagOpenRe(): RegExp {
    return /<c-component\b([\s\S]*?)>/g;
}

/**
 * Reference to a Cotton tag — either an opening `<c-NAME` or closing
 * `</c-NAME` lead-in, NOT requiring a closing `>`. Useful for semantic
 * tokens and rename-style scans where we colour the `c-NAME` identifier
 * regardless of attribute structure.
 *
 * Capture groups:
 *   [1] — `c-NAME` (the `c-` prefix is included so callers can highlight it).
 */
export function cottonTagReferenceRe(): RegExp {
    return /<\/?(c-[\w.-]+)/g;
}

// ── Regex helpers ────────────────────────────────────────────────────────

/** Escape a string so it can be safely interpolated into a `new RegExp(...)`
 *  pattern. Use this whenever a user- or scanner-supplied tag/prop name has
 *  to be matched literally — dot, plus, etc. are all special otherwise. */
export function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
