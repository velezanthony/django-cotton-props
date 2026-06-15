import * as assert from 'assert';
import { toSnake, toKebab, nameVariations } from '../../core/naming';

suite('naming', () => {

    suite('toSnake', () => {
        test('converts kebab to snake', () => {
            assert.strictEqual(toSnake('foo-bar'), 'foo_bar');
        });

        test('leaves snake unchanged', () => {
            assert.strictEqual(toSnake('foo_bar'), 'foo_bar');
        });

        test('leaves single-word unchanged', () => {
            assert.strictEqual(toSnake('foo'), 'foo');
        });

        test('converts multiple hyphens', () => {
            assert.strictEqual(toSnake('a-b-c-d'), 'a_b_c_d');
        });
    });

    suite('toKebab', () => {
        test('converts snake to kebab', () => {
            assert.strictEqual(toKebab('foo_bar'), 'foo-bar');
        });

        test('leaves kebab unchanged', () => {
            assert.strictEqual(toKebab('foo-bar'), 'foo-bar');
        });

        test('leaves single-word unchanged', () => {
            assert.strictEqual(toKebab('foo'), 'foo');
        });

        test('converts multiple underscores', () => {
            assert.strictEqual(toKebab('a_b_c_d'), 'a-b-c-d');
        });
    });

    suite('nameVariations', () => {
        test('returns single entry for word without separators', () => {
            assert.deepStrictEqual(nameVariations('foo'), ['foo']);
        });

        test('returns [snake, kebab] for kebab input', () => {
            assert.deepStrictEqual(nameVariations('foo-bar'), ['foo_bar', 'foo-bar']);
        });

        test('returns [snake, kebab] for snake input', () => {
            assert.deepStrictEqual(nameVariations('foo_bar'), ['foo_bar', 'foo-bar']);
        });

        test('no duplicates — never returns same string twice', () => {
            const variants = nameVariations('hello');
            assert.strictEqual(new Set(variants).size, variants.length);
        });

        test('both forms always present when input has separators', () => {
            const v = nameVariations('my-prop-name');
            assert.ok(v.includes('my_prop_name'));
            assert.ok(v.includes('my-prop-name'));
        });

        test('handles mixed separators (treats as 2-variant)', () => {
            const v = nameVariations('foo-bar_baz');
            assert.ok(v.includes('foo_bar_baz'));
            assert.ok(v.includes('foo-bar-baz'));
            assert.strictEqual(v.length, 2);
        });

        test('preserves digits in names', () => {
            const v = nameVariations('my-prop-2');
            assert.ok(v.includes('my_prop_2'));
            assert.ok(v.includes('my-prop-2'));
        });

        test('handles leading separator', () => {
            const v = nameVariations('-foo');
            assert.ok(v.includes('_foo'));
            assert.ok(v.includes('-foo'));
        });

        test('handles empty string without crashing', () => {
            assert.deepStrictEqual(nameVariations(''), ['']);
        });
    });
});
