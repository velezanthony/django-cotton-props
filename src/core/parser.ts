import { BUILTIN, COTTON_TAG_PREFIX } from './constants';
import type { CVar, CVarsBlock, ParsedComponent, PropDefinition, Slot } from './models';

/** `'<c-vars'` — the literal opening of the c-vars built-in tag. Used as
 *  an offset baseline when computing attribute positions inside `<c-vars ...>`. */
const COTTON_VARS_PREFIX = `${COTTON_TAG_PREFIX}${BUILTIN.VARS}`;

export const PROP_BLOCK_RE = /\{#\s*@prop\s+(.+?)\s*#\}/g;
const FILTER_RE = /^(\w[\w-]*)(?::(?:"([^"]*)"|(\S+)))?$/;
const HEAD_RE = /^(:?[\w-]+):(\w+)(?:\[([^\]]*)\])?$/;
const OPTION_RE = /'([^']*)'/g;
const CVARS_TAG_RE = /<c-vars\s+([^>]+)>/;
const CVARS_ATTR_RE = /(:?)([\w-]+)(?:=["']([^"']*)["'])?/g;
const DESCRIPTION_RE = /\{#\s*@description\s+(.+?)\s*#\}/;
const SLOT_RE = /\{#\s*@slot(?::([\w-]+))?\s*(.*?)\s*#\}/g;
const TRIGGER_RE = /\{#\s*@trigger\s+(.*?)(?:\s*—\s*[^#]*)?\s*#\}/;
// Matches `<c-vars [attrs]>` or `<c-vars [attrs] />`. The `\b` ensures
// `<c-varsx>` is not picked up. Attribute body is captured non-greedily.
const CVARS_OPEN_RE = /<c-vars\b([^>]*?)\s*\/?>/i;
// Walks the attribute body. Mirrors the gallery's _ATTR — accepts quoted
// values, unquoted tokens, and bare flags, with optional `:` dynamic prefix.
const CVARS_BODY_ATTR_RE = /(:?[A-Za-z_][\w-]*)(?:=(?:"([^"]*)"|([^\s"]+)))?/g;
const DJANGO_COMMENT_RE = /\{#[\s\S]*?#\}/g;
// Mirrors the gallery's _ACCEPTS_ATTRS heuristic — three OR alternates so
// any of {{ attrs }}, :attrs="attrs", or attrs="attrs" registers as a hit.
const ACCEPTS_ATTRS_RE = /\{\{\s*attrs\b|:?attrs="attrs"|\battrs="attrs"/;
const VALID_TYPES = ['text', 'number', 'boolean', 'select'];

export function parsePropFilters(body: string): PropDefinition | null {
    const segments = body.split('|').map(s => s.trim());

    const head = segments[0];
    const headMatch = head.match(HEAD_RE);
    if (!headMatch) { return null; }

    const rawName = headMatch[1];
    const rawType = headMatch[2];
    const optsStr = headMatch[3] ?? '';

    const options = optsStr
        ? (optsStr.match(OPTION_RE) ?? []).map(o => o.slice(1, -1))
        : [];

    let defaultValue = '';
    let hasDefault = false;
    let description = '';
    let required = false;
    let deprecated: string | undefined;
    let hidden = false;
    let example = '';

    for (let i = 1; i < segments.length; i++) {
        const m = FILTER_RE.exec(segments[i]);
        if (!m) { continue; }
        const key = m[1];
        const val = m[2] ?? m[3] ?? '';

        switch (key) {
            case 'default':    hasDefault = true; defaultValue = val; break;
            case 'description': description = val; break;
            case 'required':   required = true; break;
            case 'deprecated': deprecated = val; break;
            case 'hidden':     hidden = true; break;
            case 'example':    example = val; break;
        }
    }

    if (hasDefault) { required = false; }

    return {
        name: rawName,
        cleanName: rawName.replace(/^:/, ''),
        type: (VALID_TYPES.includes(rawType) ? rawType : 'text') as PropDefinition['type'],
        options,
        defaultValue,
        hasDefault,
        description,
        isDynamic: rawName.startsWith(':'),
        required,
        deprecated,
        hidden,
        example,
    };
}

/**
 * Returns the prop list a UI consumer (autocomplete, hover, code lens)
 * should show for a component file.
 *
 * Two sources, in priority order:
 *   1. `@prop` annotations — full type/default/required/description info.
 *   2. `<c-vars>` attributes — synthesised as `text` props with defaults
 *      lifted from the attr value, so components that document themselves
 *      with c-vars only (legacy or simple cases) still get IntelliSense.
 *
 * NOTE: this is an IDE-convenience shape. For canonical
 * gallery-equivalent parsing, use `parseComponent()` — it exposes
 * `props` (just @prop) and `cvars` (just <c-vars>) separately so each
 * caller decides how to interpret the dual syntax.
 */
export function parseProps(content: string): PropDefinition[] {
    const props: PropDefinition[] = [];

    for (const match of content.matchAll(PROP_BLOCK_RE)) {
        const prop = parsePropFilters(match[1]);
        if (prop) { props.push(prop); }
    }

    if (props.length > 0) { return props; }

    const cVarsMatch = content.match(CVARS_TAG_RE);
    if (!cVarsMatch) { return []; }

    for (const match of cVarsMatch[1].matchAll(CVARS_ATTR_RE)) {
        props.push({
            name: match[1] ? `:${match[2]}` : match[2],
            cleanName: match[2],
            type: 'text',
            options: [],
            defaultValue: match[3] || '',
            hasDefault: match[3] !== undefined,
            description: '',
            isDynamic: match[1] === ':',
            required: false,
            hidden: false,
            example: '',
        });
    }
    return props;
}

const STRICT_RE = /\{#\s*@strict\s*#\}/;
const IGNORE_UNUSED_RE = /\{#\s*@ignore-unused\b/;

export function isStrictComponent(content: string): boolean {
    return STRICT_RE.test(content);
}

export function hasIgnoreUnused(content: string): boolean {
    return IGNORE_UNUSED_RE.test(content);
}

export function parseDescription(content: string): string {
    const m = DESCRIPTION_RE.exec(content);
    return m ? m[1].trim() : '';
}

function splitSlotBody(body: string): { content: string; description: string } {
    if (body.startsWith('—')) {
        return { content: '', description: body.replace(/^—+/, '').trim() };
    }
    const idx = body.indexOf(' — ');
    if (idx !== -1) {
        return {
            content: body.slice(0, idx).trim(),
            description: body.slice(idx + 3).trim(),
        };
    }
    return { content: body, description: '' };
}

export function parseTrigger(content: string): string {
    const m = TRIGGER_RE.exec(content);
    return m ? m[1].trim() : '';
}

export function detectsAcceptsAttrs(content: string): boolean {
    return ACCEPTS_ATTRS_RE.test(content);
}

/**
 * Replace `{# ... #}` comment bodies with same-length whitespace, so a
 * literal `<c-vars>` mention inside a comment cannot shadow the real one.
 *
 * Newlines are preserved on purpose — the gallery's Python equivalent
 * blanks them too, but doing so mutates line numbers for everything after
 * a multi-line comment. Keeping `\n` makes line tracking robust without
 * changing observable c-vars detection behavior.
 */
function blankDjangoComments(source: string): string {
    return source.replace(DJANGO_COMMENT_RE, m => m.replace(/[^\n]/g, ' '));
}

function lineOf(source: string, offset: number): number {
    let line = 1;
    for (let i = 0; i < offset; i++) {
        if (source.charCodeAt(i) === 10 /* \n */) { line++; }
    }
    return line;
}

export function parseCVars(content: string): CVarsBlock | null {
    const cleaned = blankDjangoComments(content);

    const tagMatch = CVARS_OPEN_RE.exec(cleaned);
    if (!tagMatch) { return null; }

    const tagStart = tagMatch.index;
    const attrsBody = tagMatch[1] ?? '';
    const bodyStart = tagStart + tagMatch[0].indexOf(attrsBody, COTTON_VARS_PREFIX.length);

    const attrs: CVar[] = [];
    for (const m of attrsBody.matchAll(CVARS_BODY_ATTR_RE)) {
        const name = m[1];
        const quoted = m[2];
        const unquoted = m[3];
        const hasValue = quoted !== undefined || unquoted !== undefined;
        const value = quoted ?? unquoted ?? '';
        attrs.push({
            name,
            cleanName: name.replace(/^:/, ''),
            dynamic: name.startsWith(':'),
            hasValue,
            value,
            line: lineOf(cleaned, bodyStart + m.index!),
        });
    }

    return { line: lineOf(cleaned, tagStart), attrs };
}

export function parseSlots(content: string): Slot[] {
    const slots: Slot[] = [];
    for (const m of content.matchAll(SLOT_RE)) {
        const { content: slotContent, description } = splitSlotBody(m[2] ?? '');
        slots.push({
            name: m[1] ?? null,
            content: slotContent,
            description,
        });
    }
    return slots;
}

/**
 * Single-pass parse of a Cotton component source. Mirrors the gallery's
 * `AnnotationParser.parse()` — every consumer should prefer this over
 * piecemeal calls so we read the source exactly once per change.
 */
export function parseComponent(content: string): ParsedComponent {
    return {
        props: parseProps(content),
        description: parseDescription(content),
        slots: parseSlots(content),
        trigger: parseTrigger(content),
        cvars: parseCVars(content),
        acceptsAttrs: detectsAcceptsAttrs(content),
        isStrict: isStrictComponent(content),
        ignoreUnused: hasIgnoreUnused(content),
    };
}
