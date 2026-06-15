import * as assert from 'assert';
import {
    findOpeningTagAt,
    findClosingTag,
    stripIsAttribute,
} from '../../core/providers/refactor';

suite('refactor: findOpeningTagAt', () => {

    test('locates the opening tag the cursor sits inside', () => {
        const text = '<div><c-atoms.button variant="primary">x</c-atoms.button></div>';
        const open = findOpeningTagAt(text, text.indexOf('c-atoms'));
        assert.ok(open);
        assert.strictEqual(open!.tag, 'atoms.button');
        assert.strictEqual(open!.selfClose, false);
    });

    test('returns selfClose=true for self-closing tags', () => {
        const text = '<c-atoms.icon />';
        const open = findOpeningTagAt(text, 4);
        assert.ok(open);
        assert.strictEqual(open!.selfClose, true);
    });

    test('multi-line opening tag is detected', () => {
        const text = '<c-component\n    is="atoms.button"\n/>';
        // Cursor anywhere inside the tag head should resolve.
        const open = findOpeningTagAt(text, text.indexOf('is='));
        assert.ok(open);
        assert.strictEqual(open!.tag, 'component');
        assert.strictEqual(open!.selfClose, true);
    });

    test('returns undefined when cursor is outside any tag head', () => {
        const text = '<c-atoms.button>content</c-atoms.button>';
        // Position inside 'content' is outside the head.
        const open = findOpeningTagAt(text, text.indexOf('content'));
        assert.strictEqual(open, undefined);
    });
});

suite('refactor: findClosingTag (depth-aware)', () => {

    test('matches the simple pair', () => {
        const text = '<c-foo>x</c-foo>';
        const close = findClosingTag(text, '<c-foo>'.length, 'foo');
        assert.ok(close);
        assert.strictEqual(text.substring(close!.start, close!.end), '</c-foo>');
    });

    test('skips nested same-name tags', () => {
        const text = '<c-foo>\n  <c-foo>inner</c-foo>\n</c-foo>';
        const close = findClosingTag(text, '<c-foo>'.length, 'foo');
        assert.ok(close);
        // Must land on the OUTER close, not the inner one.
        assert.strictEqual(text.substring(close!.start, close!.end), '</c-foo>');
        // The outer close is the LAST occurrence.
        assert.strictEqual(close!.start, text.lastIndexOf('</c-foo>'));
    });

    test('treats nested self-closing same-name tag as zero-depth contribution', () => {
        const text = '<c-foo>\n  <c-foo />\n</c-foo>';
        const close = findClosingTag(text, '<c-foo>'.length, 'foo');
        assert.ok(close);
        assert.strictEqual(close!.start, text.indexOf('</c-foo>'));
    });

    test('returns undefined when there is no matching close', () => {
        const text = '<c-foo>\n  no close here';
        assert.strictEqual(findClosingTag(text, 7, 'foo'), undefined);
    });

    test('handles dotted tag names', () => {
        const text = '<c-atoms.button>x</c-atoms.button>';
        const close = findClosingTag(text, '<c-atoms.button>'.length, 'atoms.button');
        assert.ok(close);
        assert.strictEqual(text.substring(close!.start, close!.end), '</c-atoms.button>');
    });
});

suite('refactor: stripIsAttribute', () => {

    test('strips is="..." with surrounding attributes', () => {
        assert.strictEqual(
            stripIsAttribute(' class="x" is="atoms.button" foo="y"'),
            ' class="x" foo="y"',
        );
    });

    test('strips a leading is="..."', () => {
        assert.strictEqual(
            stripIsAttribute(' is="atoms.button" class="x"'),
            ' class="x"',
        );
    });

    test('strips :is="..." too', () => {
        assert.strictEqual(
            stripIsAttribute(' :is="my_var" class="x"'),
            ' class="x"',
        );
    });

    test('handles single-quoted values', () => {
        assert.strictEqual(
            stripIsAttribute(" is='atoms.button' class='x'"),
            " class='x'",
        );
    });

    test('leaves the string untouched when there is no is= attribute', () => {
        assert.strictEqual(
            stripIsAttribute(' class="x" foo="y"'),
            ' class="x" foo="y"',
        );
    });
});
