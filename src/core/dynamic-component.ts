/**
 * Parsing for django-cotton's dynamic-tag dispatch:
 *
 *     <c-component is="icons.spinner" />
 *     <c-component is="icons.{{ name }}" />
 *     <c-component :is="icon_name" />
 *
 * The `is="..."` form is a quoted string that may contain Django template
 * interpolation (`{{ var }}` / `{% tag %}`). The `:is="..."` form is a
 * Django expression we can't evaluate at edit-time.
 */

export type IsAttribute =
    | { kind: 'literal'; target: string }
    | { kind: 'prefix'; prefix: string }
    | { kind: 'dynamic' };

const INTERP_RE = /\{\{|\{%/;

/**
 * Classify the value of an `is`/`:is` attribute.
 *
 *   is="icons.spinner"       → literal('icons.spinner')
 *   is="icons.{{ name }}"    → prefix('icons.')
 *   is="{{ name }}"          → dynamic
 *   is=""                    → dynamic
 *   :is="anything"           → dynamic   (Django expression, can't resolve)
 */
export function parseIsAttribute(rawValue: string, isExpression: boolean): IsAttribute {
    if (isExpression || !rawValue) {
        return { kind: 'dynamic' };
    }
    const m = INTERP_RE.exec(rawValue);
    if (!m) {
        return { kind: 'literal', target: rawValue };
    }
    const prefix = rawValue.slice(0, m.index);
    if (!prefix) {
        return { kind: 'dynamic' };
    }
    return { kind: 'prefix', prefix };
}

/**
 * Find the `is` / `:is` attribute on a `<c-component>` tag's attribute string
 * (the substring between the tag name and the closing `>`).
 *
 * Returns the value, whether it's the expression form, and the offset of the
 * value's first character relative to the start of the attribute string —
 * callers need that offset to position diagnostics or selection ranges.
 */
export interface IsAttributeMatch {
    raw: string;
    isExpression: boolean;
    /** Offset of the value's first char, relative to the start of `attrsText`. */
    valueOffset: number;
}

const IS_ATTR_RE = /(\s)(:?)is=(["'])([^"']*)\3/;

export function findIsAttribute(attrsText: string): IsAttributeMatch | undefined {
    const m = IS_ATTR_RE.exec(attrsText);
    if (!m) { return undefined; }
    const fullMatchStart = m.index;
    // Layout of m[0]: <leading-ws><:?>is=<quote><value><quote>
    const leadingWs = m[1].length;     // 1
    const prefixColon = m[2].length;   // 0 or 1
    const isLen = 'is='.length;         // 3
    const quoteLen = m[3].length;       // 1
    const valueOffset = fullMatchStart + leadingWs + prefixColon + isLen + quoteLen;
    return {
        raw: m[4],
        isExpression: m[2] === ':',
        valueOffset,
    };
}
