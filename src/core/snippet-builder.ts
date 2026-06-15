import type { PropDefinition } from './models';

export interface SnippetBuilderOptions {
    /** Leading indent applied to each prop line and to the slot body. */
    indent: string;
}

/**
 * Build a Cotton component usage snippet with every relevant prop expanded.
 *
 *   <c-atoms.button
 *       variant="${1:primary}"
 *       size="${2:md}"
 *   >
 *       $0
 *   </c-atoms.button>
 *
 * Tabstops cycle through the props in declaration order, and the slot body
 * gets `$0` so the cursor lands inside the tag after the user fills in all
 * the props. Components with no usable props collapse to one line.
 *
 * `hidden` and `deprecated` props are skipped — they shouldn't appear in
 * fresh usage code. Required props without a default get a placeholder that
 * is the prop name itself, so the snippet remains valid Cotton syntax even
 * before the user types anything.
 */
export function buildUsageSnippet(
    tag: string,
    props: PropDefinition[],
    opts: SnippetBuilderOptions = { indent: '    ' },
): string {
    const usable = props.filter(p => !p.hidden && p.deprecated === undefined);
    if (usable.length === 0) {
        return `<c-${tag}>$0</c-${tag}>`;
    }

    const lines: string[] = [];
    let tabIndex = 1;
    for (const p of usable) {
        const attrName = (p.isDynamic ? ':' : '') + p.cleanName;
        const placeholderRaw = p.hasDefault ? p.defaultValue : (p.example || p.cleanName);
        const placeholder = escapeSnippet(placeholderRaw);
        lines.push(`${opts.indent}${attrName}="\${${tabIndex}:${placeholder}}"`);
        tabIndex++;
    }
    return `<c-${tag}\n${lines.join('\n')}\n>\n${opts.indent}$0\n</c-${tag}>`;
}

/** Escape characters with snippet-level meaning: `$`, `}`, `\`. */
function escapeSnippet(s: string): string {
    return s.replace(/[\\$}]/g, m => '\\' + m);
}

/**
 * Open-tag-only counterpart for callers that want to compose their own body
 * around the tag (e.g. the "Wrap with Component" command inserts the user's
 * selection between the open and close tags). Tabstops cycle through every
 * usable prop starting at `startIndex`. Caller is responsible for emitting
 * the corresponding `</c-tag>` close.
 */
export function buildUsageOpenTag(
    tag: string,
    props: PropDefinition[],
    opts: SnippetBuilderOptions = { indent: '    ' },
    startIndex = 1,
): string {
    const usable = props.filter(p => !p.hidden && p.deprecated === undefined);
    if (usable.length === 0) {
        return `<c-${tag}>`;
    }
    const lines: string[] = [];
    let tabIndex = startIndex;
    for (const p of usable) {
        const attrName = (p.isDynamic ? ':' : '') + p.cleanName;
        const placeholderRaw = p.hasDefault ? p.defaultValue : (p.example || p.cleanName);
        const placeholder = escapeSnippet(placeholderRaw);
        lines.push(`${opts.indent}${attrName}="\${${tabIndex}:${placeholder}}"`);
        tabIndex++;
    }
    return `<c-${tag}\n${lines.join('\n')}\n>`;
}
