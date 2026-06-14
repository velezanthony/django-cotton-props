import type { PropDefinition } from './PropDefinition';
import type { Slot } from './Slot';
import type { CVarsBlock } from './CVarsBlock';

/**
 * Result of running the annotation parser on a single component source file.
 *
 * Mirrors `ParsedComponent` in django-cotton-gallery (`core/schemas.py`). The
 * gallery is the canonical reference — when its parser changes, this shape
 * and the asserts in `parser-parity.test.ts` move with it.
 */
export interface ParsedComponent {
    /** Props declared via `{# @prop ... #}` annotations. Empty when absent. */
    props: PropDefinition[];
    description: string;
    slots: Slot[];
    /** Trigger HTML content from `{# @trigger ... #}`, or `""` when absent. */
    trigger: string;
    /** Parsed `<c-vars>` declaration, or `null` when the component has none. */
    cvars: CVarsBlock | null;
    /**
     * True when the template body forwards parent attributes via `{{ attrs }}`
     * or an `attrs="attrs"` pass-through. Mirrors the gallery's
     * `_ACCEPTS_ATTRS` heuristic.
     */
    acceptsAttrs: boolean;
    /** True when the source contains a `{# @strict #}` annotation. */
    isStrict: boolean;
    /**
     * True when the source contains `{# @ignore-unused #}`. The Cotton sidebar
     * uses this to suppress the "unused component" badge for components that
     * are deliberately unused in this workspace (e.g. published library
     * components, dynamic-tag references the indexer can't resolve).
     */
    ignoreUnused: boolean;
}
