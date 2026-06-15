import * as assert from 'assert';
import {
    extractSnippets,
    normalizeSnippet,
    firstLine,
    truncate,
} from '../../core/commands/find-patterns';

suite('findExtractablePatterns helpers', () => {

    suite('extractSnippets', () => {
        test('extracts a single button block', () => {
            const html = '<button class="btn">Click</button>';
            const snippets = extractSnippets(html);
            assert.strictEqual(snippets.length, 1);
            assert.strictEqual(snippets[0].snippet, '<button class="btn">Click</button>');
            assert.strictEqual(snippets[0].offset, 0);
        });

        test('handles nested same-tag (e.g. <div> inside <div>)', () => {
            const html = '<div class="outer"><div class="inner">hi</div></div>';
            const snippets = extractSnippets(html);
            // Both the outer and inner div should be snippets
            const outer = snippets.find(s => s.snippet.includes('outer'));
            const inner = snippets.find(s => s.snippet.includes('inner') && !s.snippet.includes('outer'));
            assert.ok(outer, 'Should extract outer div');
            assert.ok(inner, 'Should extract inner div');
        });

        test('skips self-closing tags', () => {
            const html = '<input type="text" />';
            const snippets = extractSnippets(html);
            assert.strictEqual(snippets.length, 0);
        });

        test('extracts multiple button occurrences', () => {
            const html = '<button>A</button><button>B</button><button>C</button>';
            const snippets = extractSnippets(html);
            assert.strictEqual(snippets.length, 3);
        });

        test('unmatched close is ignored', () => {
            const html = '<button>unclosed';
            const snippets = extractSnippets(html);
            assert.strictEqual(snippets.length, 0);
        });
    });

    suite('normalizeSnippet', () => {
        test('collapses whitespace between tags', () => {
            const out = normalizeSnippet('<div>\n  <span>hi</span>\n</div>');
            assert.strictEqual(out, '<div><span>hi</span></div>');
        });

        test('normalizes Django variables to {{}}', () => {
            assert.strictEqual(normalizeSnippet('{{ foo }}'), '{{}}');
            assert.strictEqual(normalizeSnippet('{{ user.name|upper }}'), '{{}}');
        });

        test('normalizes Django tags to {%}', () => {
            assert.strictEqual(normalizeSnippet('{% if foo %}'), '{%}');
        });

        test('two semantically-equal buttons hash-equal after normalization', () => {
            const a = '<button class="btn">{{ label_a }}</button>';
            const b = '<button class="btn">{{ label_b }}</button>';
            assert.strictEqual(normalizeSnippet(a), normalizeSnippet(b));
        });

        test('different tags produce different normalized output', () => {
            const a = '<button class="btn-primary">x</button>';
            const b = '<button class="btn-secondary">x</button>';
            assert.notStrictEqual(normalizeSnippet(a), normalizeSnippet(b));
        });
    });

    suite('truncate', () => {
        test('leaves a string shorter than the limit untouched', () => {
            assert.strictEqual(truncate('short', 80), 'short');
        });

        test('leaves a string exactly at the limit untouched', () => {
            assert.strictEqual(truncate('abcde', 5), 'abcde');
        });

        test('truncates and appends an ellipsis when over the limit', () => {
            const out = truncate('abcdefghij', 5);
            assert.strictEqual(out, 'abcd…');
            assert.strictEqual(out.length, 5, 'total length must equal the limit, ellipsis included');
        });
    });

    suite('firstLine', () => {
        test('returns only the first line of a multi-line string', () => {
            assert.strictEqual(firstLine('  <div>\n  <span>hi</span>\n</div>'), '<div>');
        });

        test('trims leading and trailing whitespace before splitting', () => {
            assert.strictEqual(firstLine('\n\t  hello  \n'), 'hello');
        });

        test('truncates a long first line to 80 chars with an ellipsis', () => {
            const long = 'x'.repeat(120);
            const out = firstLine(long);
            assert.strictEqual(out.length, 80);
            assert.ok(out.endsWith('…'), 'a truncated first line must end with an ellipsis');
        });
    });
});
