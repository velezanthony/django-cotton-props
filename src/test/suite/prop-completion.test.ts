import * as assert from 'assert';
import * as vscode from 'vscode';
import { PropCompletionProvider } from '../../core/providers/prop-completion';

// Props belong in ATTRIBUTE position — after the tag name and a separating
// space. While the cursor is still glued to the tag name (e.g. mid-edit, after
// deleting a letter), the user is editing the NAME, not adding attributes;
// offering that (possibly transient) component's props is premature and wrong.
async function propsAtEnd(content: string): Promise<vscode.CompletionItem[]> {
    const doc = await vscode.workspace.openTextDocument({ content, language: 'html' });
    const pos = new vscode.Position(0, content.length);
    const items = new PropCompletionProvider().provideCompletionItems(doc, pos);
    return (items as vscode.CompletionItem[]) ?? [];
}

suite('PropCompletionProvider — props only in attribute position', () => {

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('cursor glued to a complete tag name offers NO props (still editing the name)', async () => {
        const items = await propsAtEnd('<c-atoms.button');
        assert.strictEqual(items.length, 0,
            `editing the name must not offer props, got: ${items.map(i => i.label).join(', ')}`);
    });

    test('after the tag name AND a space, props ARE offered', async () => {
        const items = await propsAtEnd('<c-atoms.button ');
        assert.ok(items.length > 0, 'expected props in attribute position');
    });

    test('typing a partial prop name still offers props', async () => {
        const items = await propsAtEnd('<c-atoms.button :var');
        assert.ok(items.length > 0, 'expected props while typing a prop name');
    });

    test('inside an open attribute value offers NO props (value completions own it)', async () => {
        const items = await propsAtEnd('<c-atoms.button variant="');
        assert.strictEqual(items.length, 0, 'value position is not for the prop list');
    });
});
