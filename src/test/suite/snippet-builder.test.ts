import * as assert from 'assert';
import { buildUsageSnippet, buildUsageOpenTag } from '../../core/snippet-builder';
import type { PropDefinition } from '../../core/models';

function prop(partial: Partial<PropDefinition>): PropDefinition {
    return {
        name: 'x',
        cleanName: 'x',
        type: 'text',
        options: [],
        defaultValue: '',
        hasDefault: false,
        description: '',
        isDynamic: false,
        required: false,
        hidden: false,
        example: '',
        ...partial,
    };
}

suite('SnippetBuilder: buildUsageSnippet', () => {

    test('component with no props collapses to single-line slot', () => {
        const out = buildUsageSnippet('atoms.divider', []);
        assert.strictEqual(out, '<c-atoms.divider>$0</c-atoms.divider>');
    });

    test('multiple props get sequential tabstops with defaults as placeholders', () => {
        const out = buildUsageSnippet('atoms.button', [
            prop({ cleanName: 'variant', type: 'select', defaultValue: 'primary', hasDefault: true, options: ['primary', 'secondary'] }),
            prop({ cleanName: 'size', type: 'select', defaultValue: 'md', hasDefault: true, options: ['sm', 'md', 'lg'] }),
        ]);
        assert.ok(out.includes('variant="${1:primary}"'), `Expected variant tabstop 1, got:\n${out}`);
        assert.ok(out.includes('size="${2:md}"'), `Expected size tabstop 2, got:\n${out}`);
        assert.ok(out.includes('<c-atoms.button'));
        assert.ok(out.includes('</c-atoms.button>'));
        assert.ok(out.includes('$0'), 'Should have final tabstop in slot');
    });

    test('required prop without default uses prop name as placeholder', () => {
        const out = buildUsageSnippet('foo', [
            prop({ cleanName: 'label', type: 'text', required: true, hasDefault: false }),
        ]);
        assert.ok(out.includes('label="${1:label}"'));
    });

    test('isDynamic prop is rendered with `:` prefix', () => {
        const out = buildUsageSnippet('foo', [
            prop({ cleanName: 'count', type: 'number', isDynamic: true, defaultValue: '0', hasDefault: true }),
        ]);
        assert.ok(out.includes(':count="${1:0}"'), `Expected :count tabstop, got:\n${out}`);
        // Must not also render the non-dynamic form.
        assert.ok(!out.match(/(?<!:)count="/));
    });

    test('hidden props are skipped', () => {
        const out = buildUsageSnippet('foo', [
            prop({ cleanName: 'visible', type: 'text', hasDefault: true, defaultValue: 'A' }),
            prop({ cleanName: 'secret', type: 'text', hasDefault: true, defaultValue: 'B', hidden: true }),
        ]);
        assert.ok(out.includes('visible="${1:A}"'));
        assert.ok(!out.includes('secret'));
    });

    test('deprecated props are skipped', () => {
        const out = buildUsageSnippet('foo', [
            prop({ cleanName: 'current', type: 'text', hasDefault: true, defaultValue: 'A' }),
            prop({ cleanName: 'old', type: 'text', hasDefault: true, defaultValue: 'B', deprecated: 'use current' }),
        ]);
        assert.ok(out.includes('current="${1:A}"'));
        assert.ok(!out.includes('old="'));
    });

    test('preserves prop declaration order in tabstops', () => {
        const out = buildUsageSnippet('foo', [
            prop({ cleanName: 'a', type: 'text', hasDefault: true, defaultValue: 'X' }),
            prop({ cleanName: 'b', type: 'text', hasDefault: true, defaultValue: 'Y' }),
            prop({ cleanName: 'c', type: 'text', hasDefault: true, defaultValue: 'Z' }),
        ]);
        const idxA = out.indexOf('a="');
        const idxB = out.indexOf('b="');
        const idxC = out.indexOf('c="');
        assert.ok(idxA < idxB && idxB < idxC, `Order broken: a=${idxA} b=${idxB} c=${idxC}`);
        assert.ok(out.includes('a="${1:'));
        assert.ok(out.includes('b="${2:'));
        assert.ok(out.includes('c="${3:'));
    });

    test('all-hidden + all-deprecated components fall back to bare snippet', () => {
        const out = buildUsageSnippet('foo', [
            prop({ cleanName: 'x', hidden: true }),
            prop({ cleanName: 'y', deprecated: '' }),
        ]);
        assert.strictEqual(out, '<c-foo>$0</c-foo>');
    });

    test('escapes snippet metachars in default values', () => {
        const out = buildUsageSnippet('foo', [
            prop({ cleanName: 'tpl', type: 'text', hasDefault: true, defaultValue: '$5 of {money}' }),
        ]);
        // `$` and `}` must be escaped so the placeholder text shows literally.
        assert.ok(out.includes('\\$5 of {money\\}'), `Did not escape correctly:\n${out}`);
    });

    test('respects custom indent', () => {
        const out = buildUsageSnippet('foo', [
            prop({ cleanName: 'a', hasDefault: true, defaultValue: 'X' }),
        ], { indent: '  ' });
        const lines = out.split('\n');
        // The prop line and the slot line should both use the custom indent.
        assert.ok(lines.some(l => l === '  a="${1:X}"'), `Prop line missing 2-space indent:\n${out}`);
        assert.ok(lines.some(l => l === '  $0'), `Slot line missing 2-space indent:\n${out}`);
    });

    test('uses `example` over prop name when no default and example present', () => {
        const out = buildUsageSnippet('foo', [
            prop({ cleanName: 'lat', type: 'text', required: true, hasDefault: false, example: '40.42' }),
        ]);
        assert.ok(out.includes('lat="${1:40.42}"'));
    });
});

suite('SnippetBuilder: buildUsageOpenTag', () => {

    test('no props collapses to <c-tag>', () => {
        assert.strictEqual(buildUsageOpenTag('atoms.divider', []), '<c-atoms.divider>');
    });

    test('emits multi-line open tag with each prop on its own line', () => {
        const out = buildUsageOpenTag('atoms.button', [
            prop({ cleanName: 'variant', type: 'select', defaultValue: 'primary', hasDefault: true }),
            prop({ cleanName: 'size', type: 'select', defaultValue: 'md', hasDefault: true }),
        ]);
        assert.ok(out.startsWith('<c-atoms.button\n'));
        assert.ok(out.endsWith('\n>'));
        assert.ok(out.includes('variant="${1:primary}"'));
        assert.ok(out.includes('size="${2:md}"'));
        assert.ok(!out.includes('$0'), 'open-tag-only helper should not emit slot tabstop');
        assert.ok(!out.includes('</c-'), 'open-tag-only helper should not emit closing tag');
    });

    test('honors startIndex so callers can compose snippets with other tabstops', () => {
        const out = buildUsageOpenTag('foo', [
            prop({ cleanName: 'x', hasDefault: true, defaultValue: 'X' }),
        ], { indent: '    ' }, 5);
        assert.ok(out.includes('x="${5:X}"'), `Expected tabstop starting at 5, got:\n${out}`);
    });

    test('skips hidden and deprecated props', () => {
        const out = buildUsageOpenTag('foo', [
            prop({ cleanName: 'visible', hasDefault: true, defaultValue: 'A' }),
            prop({ cleanName: 'hidden_one', hasDefault: true, defaultValue: 'B', hidden: true }),
            prop({ cleanName: 'old_one', hasDefault: true, defaultValue: 'C', deprecated: 'use visible' }),
        ]);
        assert.ok(out.includes('visible='));
        assert.ok(!out.includes('hidden_one='));
        assert.ok(!out.includes('old_one='));
    });
});
