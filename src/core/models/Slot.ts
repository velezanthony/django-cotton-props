/**
 * A slot, default or named, parsed from `{# @slot ... #}` or
 * `{# @slot:NAME ... #}` annotations.
 *
 * Mirrors `Slot` in django-cotton-gallery (`core/schemas.py`).
 */
export interface Slot {
    /** `null` for the default slot, the slot name for `@slot:NAME`. */
    name: string | null;
    /** Default content rendered when the consumer doesn't override the slot. */
    content: string;
    /** Free-text description following ` — ` in the annotation body. */
    description: string;
}
