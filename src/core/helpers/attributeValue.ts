/**
 * True when the cursor sits inside an unclosed attribute value, e.g.
 * `<c-atoms.button size="|` or `:class="{{ x |`.
 *
 * Tag and prop completions must bail in this position: only VALUE completions
 * belong inside the quotes. Without this guard the prop list (and, if the user
 * types `<c`, the tag list) leaks into the value and nests `attr="..."` /
 * `<c-tag` snippets inside the open quote.
 *
 * `linePrefix` is the current line up to the cursor. An open value is the last
 * `=` followed by a quote with no matching closing quote before the cursor.
 */
const OPEN_ATTRIBUTE_VALUE_RE = /=["'][^"']*$/;

export function isInsideAttributeValue(linePrefix: string): boolean {
    return OPEN_ATTRIBUTE_VALUE_RE.test(linePrefix);
}
