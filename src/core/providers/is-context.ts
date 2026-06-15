import { BUILTIN, COTTON_TAG_PREFIX } from '../constants';
import { findIsAttribute } from '../dynamic-component';
import { cottonComponentTagOpenRe } from '../regex';

const COTTON_COMPONENT_PREFIX = `${COTTON_TAG_PREFIX}${BUILTIN.COMPONENT}`;

/**
 * One `is`/`:is` attribute located on a `<c-component>` tag. Offsets are
 * expressed relative to whatever text was passed in:
 *   - pass a single line → offsets are column positions on that line.
 *   - pass `document.getText()` → offsets are document-wide, ready for
 *     `document.offsetAt`/`document.positionAt`.
 */
export interface IsAttributeMatch {
    /** Static value inside the quotes — may contain `{{ }}` interpolation. */
    value: string;
    /** Whether the attribute was `:is="..."` (Django expression). */
    expression: boolean;
    /** Whether the value contains Django interpolation. */
    hasInterpolation: boolean;
    /** Offset of the first character of the value. */
    valueStart: number;
    /** Offset one past the last character of the value. */
    valueEnd: number;
}

const INTERP_RE = /\{\{|\{%/;

/** Find every `is`/`:is` value range on `<c-component>` tags in `text`.
 *  Works for single-line slices and full-document scans alike. */
export function findIsAttributes(text: string): IsAttributeMatch[] {
    const results: IsAttributeMatch[] = [];
    const re = cottonComponentTagOpenRe();
    let m;
    while ((m = re.exec(text)) !== null) {
        const attrs = m[1] ?? '';
        const isAttr = findIsAttribute(attrs);
        if (!isAttr) { continue; }
        const attrsStart = m.index + COTTON_COMPONENT_PREFIX.length;
        const valueStart = attrsStart + isAttr.valueOffset;
        const valueEnd = valueStart + isAttr.raw.length;
        results.push({
            value: isAttr.raw,
            expression: isAttr.isExpression,
            hasInterpolation: INTERP_RE.test(isAttr.raw),
            valueStart,
            valueEnd,
        });
    }
    return results;
}

/** Backwards-compatible alias — kept so call sites that semantically expect
 *  per-line scanning stay self-documenting. */
export const findIsAttributeInLine = findIsAttributes;
export type IsAttributeInLine = IsAttributeMatch;
