import * as assert from 'assert';
import { parseIsAttribute, findIsAttribute } from '../../core/dynamic-component';

suite('dynamic-component: parseIsAttribute', () => {

    test('plain literal → literal kind', () => {
        assert.deepStrictEqual(parseIsAttribute('icons.spinner', false), {
            kind: 'literal',
            target: 'icons.spinner',
        });
    });

    test('prefix + Django interpolation → prefix kind', () => {
        assert.deepStrictEqual(parseIsAttribute('icons.{{ name }}', false), {
            kind: 'prefix',
            prefix: 'icons.',
        });
    });

    test('interpolation-only with no static prefix → dynamic', () => {
        assert.deepStrictEqual(parseIsAttribute('{{ name }}', false), { kind: 'dynamic' });
    });

    test('empty string → dynamic', () => {
        assert.deepStrictEqual(parseIsAttribute('', false), { kind: 'dynamic' });
    });

    test(':is expression form always → dynamic, even for literals', () => {
        assert.deepStrictEqual(parseIsAttribute('icons.spinner', true), { kind: 'dynamic' });
        assert.deepStrictEqual(parseIsAttribute('name', true), { kind: 'dynamic' });
    });

    test('Django {% tag %} also triggers prefix kind', () => {
        assert.deepStrictEqual(parseIsAttribute('icons.{% if x %}a{% else %}b{% endif %}', false), {
            kind: 'prefix',
            prefix: 'icons.',
        });
    });

    test('trailing static text after interpolation still gives prefix', () => {
        // We only ever use the static head — the tail is unreachable.
        assert.deepStrictEqual(parseIsAttribute('icons.{{ n }}-svg', false), {
            kind: 'prefix',
            prefix: 'icons.',
        });
    });
});

suite('dynamic-component: findIsAttribute', () => {

    test('extracts plain is value', () => {
        const m = findIsAttribute(' is="icons.spinner" class="size-5"');
        assert.ok(m);
        assert.strictEqual(m!.raw, 'icons.spinner');
        assert.strictEqual(m!.isExpression, false);
    });

    test('extracts :is value and flags expression', () => {
        const m = findIsAttribute(' :is="my_var"');
        assert.ok(m);
        assert.strictEqual(m!.raw, 'my_var');
        assert.strictEqual(m!.isExpression, true);
    });

    test('valueOffset points at first char of value', () => {
        const attrs = ' class="x" is="foo"';
        const m = findIsAttribute(attrs);
        assert.ok(m);
        assert.strictEqual(attrs.substr(m!.valueOffset, 3), 'foo');
    });

    test('single-quoted value works', () => {
        const m = findIsAttribute(" is='alpha.beta'");
        assert.ok(m);
        assert.strictEqual(m!.raw, 'alpha.beta');
    });

    test('no is attribute → undefined', () => {
        assert.strictEqual(findIsAttribute(' class="x" name="y"'), undefined);
    });

    test('substring "is" inside another attr name does not falsely match', () => {
        // `dismissible` contains "is" but isn't followed by `=`.
        const m = findIsAttribute(' dismissible="true"');
        assert.strictEqual(m, undefined);
    });
});
