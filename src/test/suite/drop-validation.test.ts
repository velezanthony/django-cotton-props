import * as assert from 'assert';
import { isTagArray } from '../../core/views/tree-drop-edit';

suite('DropProvider tag-array validation', () => {

    test('accepts valid tag array', () => {
        assert.strictEqual(isTagArray(['atoms.button', 'molecules.card']), true);
    });

    test('accepts single-entry array', () => {
        assert.strictEqual(isTagArray(['foo']), true);
    });

    test('accepts empty array', () => {
        assert.strictEqual(isTagArray([]), true);
    });

    test('rejects non-array', () => {
        assert.strictEqual(isTagArray('atoms.button'), false);
        assert.strictEqual(isTagArray(42), false);
        assert.strictEqual(isTagArray({ tag: 'foo' }), false);
        assert.strictEqual(isTagArray(null), false);
        assert.strictEqual(isTagArray(undefined), false);
    });

    test('rejects array with non-strings', () => {
        assert.strictEqual(isTagArray(['foo', 42]), false);
        assert.strictEqual(isTagArray([null]), false);
        assert.strictEqual(isTagArray([{ bad: 'obj' }]), false);
    });

    test('rejects array with tag names containing spaces', () => {
        assert.strictEqual(isTagArray(['atoms button']), false);
    });

    test('rejects array with tag names containing angle brackets', () => {
        assert.strictEqual(isTagArray(['<script>']), false);
        assert.strictEqual(isTagArray(['foo>evil']), false);
    });

    test('rejects array with path-traversal attempts', () => {
        assert.strictEqual(isTagArray(['../etc/passwd']), false);
    });

    test('rejects array with newlines or control chars', () => {
        assert.strictEqual(isTagArray(['foo\nbar']), false);
    });
});
