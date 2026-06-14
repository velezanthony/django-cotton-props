import { isInsideAttributeValue } from './attributeValue';

/** A partial cotton open tag at the end of the line prefix, e.g. `<c-atoms.butto`.
 *  Mirrors the TagCompletionProvider's own `angleMatch`, so we re-trigger in
 *  exactly the positions where that provider would still serve suggestions. */
const PARTIAL_TAG_RE = /<c[-\w.]*$/;

/**
 * Decide whether to re-open the tag-completion popup after a document edit.
 *
 * VS Code auto-triggers completion on the `<` trigger character or while TYPING
 * word chars (quickSuggestions) — but never on DELETION. So once the popup has
 * closed, deleting a character to edit a `<c-...` tag name leaves the user with
 * no suggestions, even though the provider would still serve them. This returns
 * true for exactly that case so the caller can fire `editor.action.triggerSuggest`.
 *
 * @param linePrefix the current line up to the cursor, AFTER the edit applied
 * @param isDeletion whether the edit removed text (vs. inserting it)
 */
export function shouldRetriggerTagCompletion(linePrefix: string, isDeletion: boolean): boolean {
    if (!isDeletion) { return false; }
    // Inside an open attribute value only VALUE completions belong — never the tag list.
    if (isInsideAttributeValue(linePrefix)) { return false; }
    return PARTIAL_TAG_RE.test(linePrefix);
}
