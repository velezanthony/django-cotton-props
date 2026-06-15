export const EXTENSION_NAME = 'Django Cotton Props';

/** The literal prefix used on every Cotton tag (`<c-NAME>`). Keep this
 *  centralised — `.length` calculations in providers should derive from
 *  it so future renames are a one-line change. */
export const COTTON_TAG_PREFIX = '<c-';

/** File extension Cotton templates use. Centralised so glob patterns,
 *  filename checks, and the `slice(0, -EXT.length)` to derive tag names
 *  all reference a single source. */
export const HTML_EXT = '.html';
export const HTML_GLOB = '**/*.html';

/** Language IDs the extension activates on: plain HTML and Django's
 *  `django-html`. Centralised — the activation `DocumentSelector` and every
 *  per-event `languageId` guard derive from this, so adding a language (e.g.
 *  `jinja-html`) is a one-line change instead of a four-site hunt. */
export const SUPPORTED_LANGUAGES: readonly string[] = ['html', 'django-html'];

/** True when a document's `languageId` is one the extension handles. */
export function isSupportedLanguage(languageId: string): boolean {
    return SUPPORTED_LANGUAGES.includes(languageId);
}

/** Default directory segments excluded from the workspace usage scan. `.*`
 *  matches any dot-directory (.venv, .git, .mypy_cache, …). Exposed to users
 *  via the `djangoCottonProps.excludePaths` setting — keep this in sync with
 *  that setting's `default` in package.json. */
export const DEFAULT_EXCLUDE_SEGMENTS: readonly string[] = [
    'node_modules', 'dist', 'build', 'venv', '__pycache__', 'coverage', '.*',
];

/** Command IDs registered by this extension. Centralised so the
 *  registration site (`extension.ts`), the invokers (tree items, detail
 *  toggle, etc.), and `package.json` all reference one source — a typo
 *  in a literal string is a runtime-only error otherwise. */
export const COMMANDS = {
    REFRESH_TREE: 'cotton.refreshTree',
    OPEN_COMPONENT: 'cotton.openComponent',
    COPY_TAG: 'cotton.copyTag',
    SELECT_COMPONENT: 'cotton.selectComponent',
    WRAP_WITH_COMPONENT: 'cotton.wrapWithComponent',
    EXTRACT_COMPONENT: 'cotton.extractComponent',
    FIND_EXTRACTABLE_PATTERNS: 'cotton.findExtractablePatterns',
} as const;

/** Context-key IDs we drive via `vscode.commands.executeCommand('setContext', ...)`. */
export const CONTEXT_KEYS = {
    DETAIL_VISIBLE: 'cotton.detailVisible',
} as const;

/** Named handles for Cotton's three built-in tags. Use these instead of
 *  literal `'component'` / `'vars'` / `'slot'` strings — the values must
 *  stay in sync with `BUILTIN_TAGS` below. */
export const BUILTIN = {
    COMPONENT: 'component',
    VARS: 'vars',
    SLOT: 'slot',
} as const;

export const BUILTIN_TAGS: readonly string[] = [BUILTIN.VARS, BUILTIN.SLOT, BUILTIN.COMPONENT];

// ── Shared regex patterns ──

/** Matches opening/closing cotton tags: <c-atoms.button>, </c-atoms.button> */
export const COTTON_TAG_RE = /c-([\w.-]+)/g;

// ── Diagnostic codes (shared between diagnostics.ts and quick-fix.ts) ──

export const DIAG_CODE = {
    DUPLICATE_PROP: 'cotton-duplicate-prop',
    MISSING_FROM_CVARS: 'cotton-missing-from-cvars',
    SYNC_DEFAULT: 'cotton-sync-default',
    UNDOCUMENTED_PROP: 'cotton-undocumented-prop',
    UNUSED_PROP: 'cotton-unused-prop',
    COMPONENT_NOT_FOUND: 'cotton-component-not-found',
    UNKNOWN_PROP: 'cotton-unknown-prop',
    DUPLICATE_USAGE_PROP: 'cotton-duplicate-usage-prop',
    DEPRECATED_PROP: 'cotton-deprecated-prop',
    INVALID_VALUE: 'cotton-invalid-value',
    MISSING_REQUIRED: 'cotton-missing-required',
    REQUIRED_WITH_DEFAULT_CONFLICT: 'cotton-required-with-default-conflict',
    TYPE_DEFAULT_MISMATCH: 'cotton-type-default-mismatch',
    ENUM_DEFAULT_OUT_OF_RANGE: 'cotton-enum-default-out-of-range',
    DYNAMIC_PREFIX_MISMATCH: 'cotton-dynamic-prefix-mismatch',
    MISSING_CVARS_TAG: 'cotton-missing-cvars-tag',
    MISSING_PROP_DESCRIPTION: 'cotton-missing-prop-description',
    MISSING_IS_ATTRIBUTE: 'cotton-missing-is-attribute',
} as const;

export const BUILTIN_COMPLETIONS: { tag: string; snippet: string; doc: string }[] = [
    {
        tag: 'vars',
        snippet: '<c-vars ${1:prop}="${2:value}" />',
        doc: '**c-vars** — Declare component props/state\n\nSelf-closing tag that defines default values for component props.',
    },
    {
        tag: 'slot',
        snippet: '<c-slot name="${1:name}">${2:content}</c-slot>',
        doc: '**c-slot** — Named content slot\n\nDefine a named slot for component content injection.',
    },
    {
        tag: 'component',
        snippet: '<c-component is="${1:target}" />',
        doc: '**c-component** — Dynamic tag dispatcher\n\nRenders the component named by `is`. Use `is="prefix.{{ var }}"` to dispatch a literal-prefix + template-interpolated target, or `:is="my_var"` to dispatch from a Django expression. The extension resolves literal targets for Go-to-Definition, hover, completion, and unused tracking.',
    },
];
