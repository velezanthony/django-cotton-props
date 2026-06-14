import * as assert from 'assert';
import { tokenize, highlightSource } from '../../core/views/source-highlight';

suite('source-highlight: tokenize', () => {

    test('plain text emits a single text token', () => {
        const t = tokenize('hello world');
        assert.deepStrictEqual(t, [{ kind: 'text', text: 'hello world' }]);
    });

    test('django comment {# ... #} is one comment token', () => {
        const t = tokenize('{# @prop x:text #}');
        assert.strictEqual(t.length, 1);
        assert.strictEqual(t[0].kind, 'comment');
        assert.strictEqual(t[0].text, '{# @prop x:text #}');
    });

    test('django tag {% ... %} is one django-tag token', () => {
        const t = tokenize('{% if x %}body{% endif %}');
        const kinds = t.map(x => x.kind);
        assert.deepStrictEqual(kinds, ['django-tag', 'text', 'django-tag']);
    });

    test('django variable {{ ... }} is one django-var token', () => {
        const t = tokenize('hi {{ name }} bye');
        assert.strictEqual(t.length, 3);
        assert.strictEqual(t[1].kind, 'django-var');
        assert.strictEqual(t[1].text, '{{ name }}');
    });

    test('HTML tag emits html-tag token', () => {
        const t = tokenize('<div class="x">body</div>');
        const kinds = t.map(x => x.kind);
        assert.deepStrictEqual(kinds, ['html-tag', 'text', 'html-tag']);
        assert.strictEqual(t[0].text, '<div class="x">');
        assert.strictEqual(t[2].text, '</div>');
    });

    test('self-closing tag is one html-tag token', () => {
        const t = tokenize('<c-vars name="x" />');
        assert.strictEqual(t.length, 1);
        assert.strictEqual(t[0].kind, 'html-tag');
    });

    test('mixed Cotton template tokenizes cleanly', () => {
        const source = '{# @prop name:text #}\n<c-vars name="x" />\n{% if x %}{{ x }}{% endif %}';
        const t = tokenize(source);
        const kinds = t.map(x => x.kind);
        assert.deepStrictEqual(kinds, [
            'comment',
            'text',
            'html-tag',
            'text',
            'django-tag',
            'django-var',
            'django-tag',
        ]);
    });

    test('unterminated Django construct degrades to text (no infinite loop)', () => {
        const t = tokenize('{# never closes');
        // Whole thing falls through as text — no exception, no crash.
        assert.strictEqual(t.length, 1);
        assert.strictEqual(t[0].kind, 'text');
    });

    test('< followed by space/number/symbol is NOT treated as HTML tag', () => {
        const t = tokenize('5 < 10 and x > 0');
        // No html-tag tokens — `<` here is an operator.
        assert.ok(t.every(x => x.kind === 'text'), `Got tokens: ${JSON.stringify(t)}`);
    });
});

suite('source-highlight: highlightSource (rendering)', () => {

    test('text is HTML-escaped', () => {
        const html = highlightSource('a < b & c > d');
        assert.ok(html.includes('&lt;'));
        assert.ok(html.includes('&amp;'));
        assert.ok(html.includes('&gt;'));
    });

    test('cotton @prop annotation gets the annotation class', () => {
        const html = highlightSource('{# @prop name:text | default:"x" #}');
        assert.ok(html.includes('class="tok-comment"'), `Got:\n${html}`);
        assert.ok(html.includes('class="tok-anno"'), `Got:\n${html}`);
        assert.ok(html.includes('class="tok-filter"'), `Got:\n${html}`);
        assert.ok(html.includes('@prop'));
    });

    test('HTML tag splits into bracket + name + attrs + bracket spans', () => {
        const html = highlightSource('<c-atoms.button variant="primary" />');
        assert.ok(html.includes('class="tok-bracket"'));
        assert.ok(html.includes('class="tok-tag"'));
        assert.ok(html.includes('class="tok-attr"'));
        assert.ok(html.includes('class="tok-string"'));
        assert.ok(html.includes('c-atoms.button'));
        assert.ok(html.includes('variant'));
        assert.ok(html.includes('&quot;primary&quot;'));
    });

    test('django tag keyword (if, for, ...) gets keyword class', () => {
        const html = highlightSource('{% if x %}');
        assert.ok(html.includes('class="tok-django"'));
        assert.ok(html.includes('class="tok-keyword"'));
        assert.ok(html.includes('if'));
    });

    test('django variable {{ name }} is wrapped in django span', () => {
        const html = highlightSource('{{ name }}');
        assert.ok(html.includes('class="tok-django"'));
        assert.ok(html.includes('{{ name }}'));
    });

    test('does not break on quotes inside attribute values', () => {
        // Real-world: tailwind class lists with `{% if %}` inside.
        const html = highlightSource('<div class="{% if x %}foo{% endif %}">x</div>');
        // The span structure should at least include a class= attribute and a class span.
        assert.ok(html.includes('class="tok-attr"'));
        assert.ok(html.includes('class="tok-string"'));
    });

    test('dynamic prop `:count` keeps the colon in the attr name span', () => {
        const html = highlightSource('<c-vars :count="0" />');
        // The whole `:count` token goes into the attr span.
        const attrMatch = /<span class="tok-attr">([^<]+)<\/span>/.exec(html);
        assert.ok(attrMatch, `No attr span in:\n${html}`);
        assert.strictEqual(attrMatch![1], ':count');
    });
});
