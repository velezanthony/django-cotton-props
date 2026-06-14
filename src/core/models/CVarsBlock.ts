/**
 * Parsed `<c-vars>` declaration. Mirrors `CVar` and `CVarsBlock` in
 * django-cotton-gallery (`core/cvars.py`).
 *
 * `<c-vars>` is the canonical Cotton way to declare which props a
 * component accepts. Each attribute can be:
 *   name="value"   → quoted string (`hasValue=true`)
 *   name=value     → unquoted token (`hasValue=true`, e.g. True / 0 / 1.5)
 *   name           → bare flag (`hasValue=false`, default empty string)
 * The optional leading `:` marks a dynamic prop.
 */
export interface CVar {
    /** Raw name as written in source — keeps the `:` prefix when dynamic. */
    name: string;
    /** Name without the leading `:`. */
    cleanName: string;
    /** True when the attribute had a `:` prefix in source. */
    dynamic: boolean;
    /** False for bare flags (no `=`); true for both quoted and unquoted values. */
    hasValue: boolean;
    /** Raw value as written — strings without quotes, identifiers as-is. */
    value: string;
    /** 1-based line number where the attribute appears. */
    line: number;
}

export interface CVarsBlock {
    /** 1-based line of the opening `<c-vars` tag. */
    line: number;
    attrs: CVar[];
}
