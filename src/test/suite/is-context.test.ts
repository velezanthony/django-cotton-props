import * as assert from 'assert';
import { findIsAttributeInLine, findIsAttributes } from '../../core/providers/is-context';

suite('is-context: findIsAttributeInLine', () => {

    test('finds plain is="..." on c-component', () => {
        const line = '  <c-component is="icons.spinner" class="size-5" />';
        const matches = findIsAttributeInLine(line);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].value, 'icons.spinner');
        assert.strictEqual(matches[0].expression, false);
        assert.strictEqual(matches[0].hasInterpolation, false);
        // valueStart should point at the 'i' of 'icons'.
        assert.strictEqual(line.substr(matches[0].valueStart, 5), 'icons');
        assert.strictEqual(matches[0].valueEnd - matches[0].valueStart, 'icons.spinner'.length);
    });

    test('finds :is="..." and flags as expression', () => {
        const line = '<c-component :is="my_var" />';
        const matches = findIsAttributeInLine(line);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].value, 'my_var');
        assert.strictEqual(matches[0].expression, true);
    });

    test('detects Django {{ }} interpolation', () => {
        const line = '<c-component is="icons.{{ name }}" />';
        const matches = findIsAttributeInLine(line);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].hasInterpolation, true);
    });

    test('ignores non-c-component tags with is attribute', () => {
        // A real <img is="..."> would be plain HTML; we only care about <c-component>.
        const line = '<img is="something" />';
        assert.strictEqual(findIsAttributeInLine(line).length, 0);
    });

    test('returns empty list when no is attribute is present', () => {
        const line = '<c-component class="foo" />';
        assert.strictEqual(findIsAttributeInLine(line).length, 0);
    });

    test('finds multiple c-component tags on the same line', () => {
        const line = '<c-component is="a.x" /><c-component is="b.y" />';
        const matches = findIsAttributeInLine(line);
        assert.strictEqual(matches.length, 2);
        assert.strictEqual(matches[0].value, 'a.x');
        assert.strictEqual(matches[1].value, 'b.y');
        assert.ok(matches[0].valueStart < matches[1].valueStart);
    });
});

suite('is-context: findIsAttributes — multi-line tag declarations', () => {

    test('detects is="..." when the tag is split across lines', () => {
        const text = [
            '<c-component',
            '    is="icons.spinner"',
            '    class="size-5"',
            '/>',
        ].join('\n');
        const matches = findIsAttributes(text);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].value, 'icons.spinner');
        // Offset must point exactly at the `i` of `icons.spinner` in the full document text.
        assert.strictEqual(text.substr(matches[0].valueStart, 'icons.spinner'.length), 'icons.spinner');
    });

    test('detects :is="..." on multi-line declaration and flags as expression', () => {
        const text = '<c-component\n  :is="my_var"\n/>';
        const matches = findIsAttributes(text);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].expression, true);
        assert.strictEqual(matches[0].value, 'my_var');
    });

    test('handles two multi-line dispatch tags in the same document', () => {
        const text = [
            '<c-component',
            '    is="a.x"',
            '/>',
            '<div>',
            '    <c-component',
            '        is="b.y"',
            '    />',
            '</div>',
        ].join('\n');
        const matches = findIsAttributes(text);
        assert.strictEqual(matches.length, 2);
        assert.strictEqual(matches[0].value, 'a.x');
        assert.strictEqual(matches[1].value, 'b.y');
        assert.ok(matches[0].valueStart < matches[1].valueStart, 'second tag should appear later');
    });

    test('does not match tags that never close', () => {
        // Greedy `[\s\S]*?` is non-greedy but still needs a `>` to terminate.
        // An open <c-component with no closing > should not produce a match.
        const text = '<c-component\n    is="icons.foo"';
        assert.strictEqual(findIsAttributes(text).length, 0);
    });
});
