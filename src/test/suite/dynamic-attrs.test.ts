import * as assert from 'assert';
import { findDynamicAttrValues } from '../../core/helpers';

// Returns the substring each detected range points at — the simplest way to
// assert both position and length are correct.
function values(text: string): string[] {
    return findDynamicAttrValues(text).map(({ start, end }) => text.slice(start, end));
}

suite('findDynamicAttrValues', () => {
    test('captures a single dynamic attr value', () => {
        assert.deepStrictEqual(values('<c-atoms.button :size="md" />'), ['md']);
    });

    test('ignores static (non-colon) attrs', () => {
        assert.deepStrictEqual(values('<c-atoms.button size="md" />'), []);
    });

    test('captures multiple dynamic attrs on one tag', () => {
        assert.deepStrictEqual(
            values('<c-atoms.button :size="md" :loading="isReady" />'),
            ['md', 'isReady'],
        );
    });

    test('mixes static and dynamic, keeping only dynamic', () => {
        assert.deepStrictEqual(
            values('<c-atoms.button size="md" :variant="theme" type="button" />'),
            ['theme'],
        );
    });

    test('supports single-quoted values', () => {
        assert.deepStrictEqual(values("<c-atoms.button :size='lg' />"), ['lg']);
    });

    test('skips empty values', () => {
        assert.deepStrictEqual(values('<c-atoms.button :size="" />'), []);
    });

    test('skips values that already contain {{ }} interpolation', () => {
        assert.deepStrictEqual(values('<c-atoms.button :title="{{ user.name }}" />'), []);
    });

    test('skips values that contain a {% %} tag', () => {
        assert.deepStrictEqual(values('<c-atoms.button :x="{% if a %}b{% endif %}" />'), []);
    });

    test('handles multi-line tags', () => {
        const text = '<c-atoms.button\n  size="md"\n  :loading="ready"\n/>';
        assert.deepStrictEqual(values(text), ['ready']);
    });

    test('offsets point exactly at the value (quotes excluded)', () => {
        const text = '<c-atoms.button :size="md" />';
        const [r] = findDynamicAttrValues(text);
        assert.strictEqual(text[r.start - 1], '"', 'char before start should be the opening quote');
        assert.strictEqual(text[r.end], '"', 'char at end should be the closing quote');
    });

    test('finds dynamic attrs across several tags', () => {
        const text = '<c-atoms.button :size="md" />\n<c-atoms.badge :tone="ok" />';
        assert.deepStrictEqual(values(text), ['md', 'ok']);
    });
});
