import * as assert from 'assert';
import { buildTagMatchRegex, buildDispatchMatchRegex } from '../../core/rename-handler';

suite('buildTagMatchRegex (file-rename word boundary)', () => {

    test('matches exact tag', () => {
        const re = buildTagMatchRegex('foo');
        const text = '<c-foo>';
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0][0], 'c-foo');
    });

    test('regression: does NOT match c-foo inside c-foo-bar', () => {
        const re = buildTagMatchRegex('foo');
        const text = '<c-foo-bar></c-foo-bar>';
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 0, 'Renaming c-foo must NOT corrupt c-foo-bar');
    });

    test('regression: does NOT match c-foo inside c-foo.child', () => {
        const re = buildTagMatchRegex('foo');
        const text = '<c-foo.child></c-foo.child>';
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 0, 'Renaming c-foo must NOT corrupt c-foo.child');
    });

    test('matches both opening and closing tag', () => {
        const re = buildTagMatchRegex('foo');
        const text = '<c-foo>content</c-foo>';
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 2);
    });

    test('matches self-closing tag', () => {
        const re = buildTagMatchRegex('atoms.button');
        const text = '<c-atoms.button />';
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 1);
    });

    test('matches tag followed by attribute (space boundary)', () => {
        const re = buildTagMatchRegex('atoms.button');
        const text = '<c-atoms.button variant="primary">';
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 1);
    });

    test('matches tag with dotted path', () => {
        const re = buildTagMatchRegex('atoms.my-button');
        const text = '<c-atoms.my-button></c-atoms.my-button>';
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 2);
    });

    test('does not match substring tag with extra dot segment', () => {
        // Renaming c-atoms.button shouldn't touch c-atoms.button.label
        const re = buildTagMatchRegex('atoms.button');
        const text = '<c-atoms.button.label />';
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 0);
    });

    test('handles tag name with regex-special characters safely', () => {
        // Tag names can contain dots — dot is regex-special. Must be escaped.
        const re = buildTagMatchRegex('a.b');
        const text = '<c-axb>';  // should NOT match (dot != any char after escape)
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 0);
    });
});

suite('buildDispatchMatchRegex (literal is="..." dispatch rename)', () => {

    test('matches single-line literal dispatch and computes value offset', () => {
        const re = buildDispatchMatchRegex('atoms.button');
        const text = '<c-component is="atoms.button" />';
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 1);
        const m = matches[0];
        const valueStart = m.index! + m[1].length;
        const valueEnd = valueStart + 'atoms.button'.length;
        assert.strictEqual(text.substring(valueStart, valueEnd), 'atoms.button');
    });

    test('matches multi-line dispatch', () => {
        const re = buildDispatchMatchRegex('atoms.button');
        const text = '<c-component\n    is="atoms.button"\n    class="x"\n/>';
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 1);
    });

    test('matches both single and double quoted values', () => {
        const re = buildDispatchMatchRegex('atoms.button');
        const text = `<c-component is="atoms.button" /><c-component is='atoms.button' />`;
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 2);
    });

    test('regression: does NOT match prefix dispatch is="atoms.{{ name }}"', () => {
        // Prefix dispatches refer to a namespace, not a specific tag. Renaming
        // one component must not blow up unrelated namespace references.
        const re = buildDispatchMatchRegex('atoms.button');
        const text = '<c-component is="atoms.{{ name }}" />';
        assert.strictEqual([...text.matchAll(re)].length, 0);
    });

    test('regression: does NOT match :is="atoms.button"', () => {
        // :is is always a Django expression — we can't statically rewrite it.
        // (Even if the user wrote a literal-looking string, it would mean a
        // variable lookup at runtime, not a tag name.)
        const re = buildDispatchMatchRegex('atoms.button');
        const text = '<c-component :is="atoms.button" />';
        assert.strictEqual([...text.matchAll(re)].length, 0);
    });

    test('regression: does NOT match a substring tag with extra segment', () => {
        const re = buildDispatchMatchRegex('atoms.button');
        // The closing quote anchors the value — extra segment after means no match.
        const text = '<c-component is="atoms.button.label" />';
        assert.strictEqual([...text.matchAll(re)].length, 0);
    });

    test('regression: does NOT match across two separate tags', () => {
        // [^>]*? must stop at the first '>' so we don't span tag boundaries.
        const re = buildDispatchMatchRegex('atoms.button');
        const text = '<c-component foo="bar"><c-component is="atoms.button" />';
        const matches = [...text.matchAll(re)];
        assert.strictEqual(matches.length, 1);
        // The match must START at the SECOND <c-component, not the first.
        assert.ok(matches[0].index! > text.indexOf('<c-component', 1) - 1);
    });

    test('handles tag name with regex-special characters safely', () => {
        const re = buildDispatchMatchRegex('a.b');
        const text = '<c-component is="axb" />';
        assert.strictEqual([...text.matchAll(re)].length, 0);
    });
});
