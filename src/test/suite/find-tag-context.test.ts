import * as assert from 'assert';
import * as vscode from 'vscode';
import { findTagContext } from '../../core/helpers';

function doc(text: string): vscode.TextDocument {
    return {
        getText: () => text,
    } as vscode.TextDocument;
}

suite('findTagContext', () => {

    test('returns tag when cursor is inside opening tag', () => {
        const d = doc('<c-atoms.button ');
        assert.strictEqual(findTagContext(d, 16), 'atoms.button');
    });

    test('returns tag when cursor is right after tag name', () => {
        const d = doc('<c-atoms.button');
        assert.strictEqual(findTagContext(d, 15), 'atoms.button');
    });

    test('returns undefined when cursor is past closing >', () => {
        const d = doc('<c-foo>text');
        assert.strictEqual(findTagContext(d, 10), undefined);
    });

    test('returns undefined when no tag before cursor', () => {
        const d = doc('plain html');
        assert.strictEqual(findTagContext(d, 5), undefined);
    });

    test('returns undefined when offset < 3 (no room for <c-)', () => {
        const d = doc('<c-foo');
        assert.strictEqual(findTagContext(d, 0), undefined);
        assert.strictEqual(findTagContext(d, 2), undefined);
    });

    test('regression: tag starting AT cursor must not be treated as current tag', () => {
        // Cursor is at offset 16 (right after first tag's space).
        // A second tag <c-other starts exactly at offset 16.
        // findTagContext should still return the FIRST tag (atoms.button), not <c-other.
        const d = doc('<c-atoms.button <c-other>');
        assert.strictEqual(findTagContext(d, 16), 'atoms.button');
    });

    test('returns last tag when multiple open tags exist', () => {
        // First tag closed, second tag open — cursor inside second
        const d = doc('<c-first>content <c-second ');
        assert.strictEqual(findTagContext(d, 26), 'second');
    });

    test('tag with dotted path (category.name)', () => {
        const d = doc('<c-molecules.card ');
        assert.strictEqual(findTagContext(d, 17), 'molecules.card');
    });

    test('tag with kebab-case name', () => {
        const d = doc('<c-my-custom-tag ');
        assert.strictEqual(findTagContext(d, 16), 'my-custom-tag');
    });
});
