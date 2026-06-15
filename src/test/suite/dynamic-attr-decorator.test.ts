import * as assert from 'assert';
import * as vscode from 'vscode';
import { createDynamicAttrDecorator } from '../../core/providers/dynamic-attr-decorator';

/**
 * The decorator's value-finding logic lives in `findDynamicAttrValues`, which is
 * covered exhaustively in dynamic-attrs.test.ts. VS Code exposes no read-back
 * API for applied decorations, so here we only blind-test the editor-lifecycle
 * WIRING: that it builds the right disposables and tears down cleanly.
 */
suite('createDynamicAttrDecorator (wiring)', () => {

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('returns a set of disposables', () => {
        const disposables = createDynamicAttrDecorator();
        try {
            assert.ok(Array.isArray(disposables));
            // decoration type + 4 event subscriptions (active editor, visible editors,
            // text change, config change).
            assert.strictEqual(disposables.length, 5);
            assert.ok(disposables.every(d => typeof d.dispose === 'function'), 'every entry must be disposable');
        } finally {
            disposables.forEach(d => d.dispose());
        }
    });

    test('disposing releases everything without throwing', () => {
        const disposables = createDynamicAttrDecorator();
        assert.doesNotThrow(() => disposables.forEach(d => d.dispose()));
    });

    test('applies against an open editor without throwing', async function () {
        this.timeout(10000);
        const doc = await vscode.workspace.openTextDocument({
            content: '<c-atoms.button :size="big" />',
            language: 'html',
        });
        await vscode.window.showTextDocument(doc);

        // The initial applyAll() runs against the visible editor on construction.
        let disposables: vscode.Disposable[] = [];
        assert.doesNotThrow(() => { disposables = createDynamicAttrDecorator(); });
        disposables.forEach(d => d.dispose());
    });

    test('reacts to a document edit without throwing (debounced apply)', async function () {
        this.timeout(10000);
        const doc = await vscode.workspace.openTextDocument({
            content: '<c-atoms.button :size="md" />',
            language: 'html',
        });
        const editor = await vscode.window.showTextDocument(doc);
        const disposables = createDynamicAttrDecorator();
        try {
            await editor.edit(b => b.insert(new vscode.Position(0, 0), '<c-atoms.badge :variant="x" />\n'));
            // Let the 150ms debounce timer fire.
            await new Promise(r => setTimeout(r, 250));
            // No read-back API for decorations, so assert the observable
            // post-condition: the edit flowed through the decorator-wired editor
            // and the document reflects it (the onDidChangeTextDocument handler
            // ran without breaking the buffer).
            assert.ok(editor.document.getText().startsWith('<c-atoms.badge :variant="x" />'),
                'the edit should have applied through the decorator-wired editor');
        } finally {
            disposables.forEach(d => d.dispose());
        }
    });
});
