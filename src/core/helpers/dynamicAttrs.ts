import { cottonTagOpenRe } from '../regex';

/** Offset range of a dynamic attribute's VALUE (the text inside the quotes,
 *  quotes excluded). */
export interface DynamicAttrValue {
    /** Offset of the first value character. */
    start: number;
    /** Offset one past the last value character. */
    end: number;
}

// A `:`-prefixed attribute on a cotton tag, e.g. ` :size="md"` / ` :on='x'`.
const DYNAMIC_ATTR_RE = /(?:^|\s):([\w-]+)=(["'])([^"']*)\2/g;
const INTERP_RE = /\{\{|\{%/;

/**
 * Find every dynamic `:attr="value"` value range on cotton tags in `text`.
 *
 * In Django Cotton a `:`-prefixed attribute is a Django EXPRESSION — its value
 * is evaluated, not taken literally. We can't resolve that expression (we don't
 * have Django's context), so we never validate it; we only locate it so callers
 * can mark it as dynamic (tint + ghost `{{ }}`).
 *
 * Values that already contain `{{`/`{%` are skipped — they're explicit
 * interpolation and adding faux braces would double up. Empty values are
 * skipped too (nothing to mark).
 */
export function findDynamicAttrValues(text: string): DynamicAttrValue[] {
    const out: DynamicAttrValue[] = [];
    const tagRe = cottonTagOpenRe();
    let tag: RegExpExecArray | null;
    while ((tag = tagRe.exec(text)) !== null) {
        const attrs = tag[2];
        if (!attrs || !attrs.includes(':')) { continue; }
        const attrsStart = tag.index + `<c-${tag[1]}`.length;

        for (const am of attrs.matchAll(DYNAMIC_ATTR_RE)) {
            const value = am[3];
            if (value.length === 0 || INTERP_RE.test(value)) { continue; }
            // Value sits just before the closing quote at the end of am[0].
            const valueStartInAttr = am.index! + am[0].length - 1 - value.length;
            const start = attrsStart + valueStartInAttr;
            out.push({ start, end: start + value.length });
        }
    }
    return out;
}
