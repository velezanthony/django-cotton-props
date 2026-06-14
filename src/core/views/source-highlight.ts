/**
 * Lightweight syntax highlighter for the Cotton Components detail panel.
 *
 * Tokenizes Cotton-flavored Django templates (HTML + Django expressions +
 * cotton annotation comments) and emits HTML with semantic class names.
 * The detail webview owns the CSS that maps those classes to colors.
 *
 * Why hand-rolled vs Shiki/Highlight.js: keeping it dep-free. The grammar
 * we care about is small and well-bounded — three Django delimiters, HTML
 * tag/attr pairs, plus the cotton annotation vocabulary. A real tokenizer
 * gives us the precision we need without a megabyte of grammar tables.
 */

type Token =
    | { kind: 'comment'; text: string }      // {# ... #}, with cotton @annotations
    | { kind: 'django-tag'; text: string }   // {% ... %}
    | { kind: 'django-var'; text: string }   // {{ ... }}
    | { kind: 'html-tag'; text: string }     // <tag ...> or </tag>
    | { kind: 'text'; text: string };

/** Render `source` as HTML with `<span class="tok-...">` wrappers. The
 *  return value is safe to inject into the webview body. */
export function highlightSource(source: string): string {
    return tokenize(source).map(renderToken).join('');
}

// ── Tokenizer ─────────────────────────────────────────────────────────────

export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    let textStart = 0;

    const flushText = (until: number) => {
        if (until > textStart) {
            tokens.push({ kind: 'text', text: source.substring(textStart, until) });
        }
    };

    while (i < source.length) {
        if (source.startsWith('{#', i)) {
            const end = source.indexOf('#}', i + 2);
            if (end !== -1) {
                flushText(i);
                tokens.push({ kind: 'comment', text: source.substring(i, end + 2) });
                i = end + 2;
                textStart = i;
                continue;
            }
        }
        if (source.startsWith('{%', i)) {
            const end = source.indexOf('%}', i + 2);
            if (end !== -1) {
                flushText(i);
                tokens.push({ kind: 'django-tag', text: source.substring(i, end + 2) });
                i = end + 2;
                textStart = i;
                continue;
            }
        }
        if (source.startsWith('{{', i)) {
            const end = source.indexOf('}}', i + 2);
            if (end !== -1) {
                flushText(i);
                tokens.push({ kind: 'django-var', text: source.substring(i, end + 2) });
                i = end + 2;
                textStart = i;
                continue;
            }
        }
        if (source[i] === '<' && (source[i + 1] === '/' || /[a-zA-Z]/.test(source[i + 1] ?? ''))) {
            const end = source.indexOf('>', i);
            if (end !== -1) {
                flushText(i);
                tokens.push({ kind: 'html-tag', text: source.substring(i, end + 1) });
                i = end + 1;
                textStart = i;
                continue;
            }
        }
        i++;
    }
    flushText(source.length);
    return tokens;
}

// ── Renderer ──────────────────────────────────────────────────────────────

function renderToken(t: Token): string {
    switch (t.kind) {
        case 'comment':    return `<span class="tok-comment">${renderComment(t.text)}</span>`;
        case 'django-tag': return `<span class="tok-django">${renderDjangoTag(t.text)}</span>`;
        case 'django-var': return `<span class="tok-django">${escapeHtml(t.text)}</span>`;
        case 'html-tag':   return renderHtmlTag(t.text);
        case 'text':       return escapeHtml(t.text);
    }
}

/** Tag head: bracket + name + attrs + bracket. Each piece gets its own
 *  class so the theme can color them independently. */
function renderHtmlTag(text: string): string {
    const m = /^(<\/?)([\w.-]+)([\s\S]*?)(\/?>)$/.exec(text);
    if (!m) { return escapeHtml(text); }
    const [, openB, name, attrs, closeB] = m;
    return (
        `<span class="tok-bracket">${escapeHtml(openB)}</span>` +
        `<span class="tok-tag">${escapeHtml(name)}</span>` +
        renderAttrs(attrs) +
        `<span class="tok-bracket">${escapeHtml(closeB)}</span>`
    );
}

const ATTR_RE = /(\s+)(:?[\w-]+)(=)?("[^"]*"|'[^']*')?/g;

function renderAttrs(attrs: string): string {
    let out = '';
    let cursor = 0;
    for (const m of attrs.matchAll(ATTR_RE)) {
        if (m.index! > cursor) {
            out += escapeHtml(attrs.substring(cursor, m.index!));
        }
        const [, ws, name, eq, value] = m;
        out += escapeHtml(ws);
        out += `<span class="tok-attr">${escapeHtml(name)}</span>`;
        if (eq) {
            out += `<span class="tok-punct">${escapeHtml(eq)}</span>`;
        }
        if (value) {
            out += `<span class="tok-string">${escapeHtml(value)}</span>`;
        }
        cursor = m.index! + m[0].length;
    }
    if (cursor < attrs.length) {
        out += escapeHtml(attrs.substring(cursor));
    }
    return out;
}

/** Cotton annotation inside `{# ... #}`: highlight the `@keyword`, then
 *  the chain of `| filter[:value]` pieces. Plain `{# comment #}` keeps
 *  the comment color end-to-end. */
function renderComment(text: string): string {
    const escaped = escapeHtml(text);
    return escaped
        .replace(/(@\w+)/g, '<span class="tok-anno">$1</span>')
        .replace(/(\|)(\s*)(\w+)(:)?/g, (_match, pipe, ws, filter, colon) =>
            `<span class="tok-punct">${pipe}</span>${ws}<span class="tok-filter">${filter}</span>${colon ? `<span class="tok-punct">${colon}</span>` : ''}`,
        );
}

/** Django `{% tag args %}` — keyword right after `{%` gets its own class. */
function renderDjangoTag(text: string): string {
    const escaped = escapeHtml(text);
    return escaped.replace(/^(\{%\s*)(\w+)/, (_match, open, kw) =>
        `${open}<span class="tok-keyword">${kw}</span>`,
    );
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
