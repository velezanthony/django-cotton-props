import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * LIVE-style acceptance test: drives the real VS Code completion APIs through
 * the exact sequence a user performs — type `<c-...`, backspace a letter,
 * trigger the suggestion list, then ACCEPT an item the way pressing Tab does
 * (replace the item's range with its insertText / snippet). Proves a real Tab
 * inserts ONE clean, balanced tag — never the nested scaffolding garbage that
 * appears in the editing-simulation fixtures.
 */
suite('Completion acceptance (real Tab behaviour)', () => {

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    function getLabel(item: vscode.CompletionItem): string {
        return typeof item.label === 'string' ? item.label : item.label.label;
    }

    /** Replace the item's range with its snippet — exactly what Tab does. */
    async function acceptItem(editor: vscode.TextEditor, item: vscode.CompletionItem): Promise<void> {
        const insert = item.insertText;
        // An item's range is either a plain Range or the dual { inserting, replacing }
        // form — Tab uses the `replacing` range.
        const raw = item.range as vscode.Range | { inserting: vscode.Range; replacing: vscode.Range } | undefined;
        const range = raw && 'replacing' in raw ? raw.replacing : raw;
        const snippet = insert instanceof vscode.SnippetString
            ? insert
            : new vscode.SnippetString(typeof insert === 'string' ? insert : getLabel(item));
        await editor.insertSnippet(snippet, range);
    }

    test('type <c-atoms.bu → backspace → accept suggestion = ONE clean tag', async function () {
        this.timeout(15000);

        // 1) Fresh empty doc, like a blank line in a template.
        const doc = await vscode.workspace.openTextDocument({ content: '', language: 'html' });
        const editor = await vscode.window.showTextDocument(doc);

        // 2) Type "<c-atoms.bu" (simulating keystrokes).
        await editor.edit(b => b.insert(new vscode.Position(0, 0), '<c-atoms.bu'));
        console.log(`DEMO> typed:        "${doc.getText()}"`);

        // 3) Backspace one letter → "<c-atoms.b".
        await editor.edit(b => b.delete(new vscode.Range(new vscode.Position(0, 10), new vscode.Position(0, 11))));
        const afterBackspace = doc.getText();
        console.log(`DEMO> after del:    "${afterBackspace}"`);
        assert.strictEqual(afterBackspace, '<c-atoms.b');

        // 4) Cursor sits right after "<c-atoms.b" → ask for the suggestion list.
        const cursor = new vscode.Position(0, 10);
        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider', doc.uri, cursor,
        );
        const labels = list.items.map(getLabel);
        console.log(`DEMO> suggestions:  ${labels.filter(l => l.includes('c-')).slice(0, 8).join(', ')} ...`);

        // The popup offers components starting with "b" — button + badge, etc.
        const button = list.items.find(i => getLabel(i) === '<c-atoms.button');
        assert.ok(button, `expected <c-atoms.button in the popup, got: ${labels.join(', ')}`);
        assert.ok(labels.some(l => l.includes('badge')), 'badge should also be offered (prefix b)');

        // 5) Press "Tab" → accept the button suggestion.
        await acceptItem(editor, button!);
        const result = doc.getText();
        console.log(`DEMO> after Tab:    "${result}"`);

        // THE PROOF: one clean, balanced tag — the typed partial replaced, not duplicated.
        assert.strictEqual(result, '<c-atoms.button></c-atoms.button>');
        // And explicitly: NO nested duplication like the editing-sim fixtures show.
        assert.strictEqual((result.match(/<c-atoms\.button/g) || []).length, 1, 'exactly one opening tag');
        assert.strictEqual((result.match(/<\/c-atoms\.button>/g) || []).length, 1, 'exactly one closing tag');
    });

    test('accepting a prop suggestion inserts ONE clean attribute', async function () {
        this.timeout(15000);

        const doc = await vscode.workspace.openTextDocument({ content: '<c-atoms.button >', language: 'html' });
        const editor = await vscode.window.showTextDocument(doc);

        // Cursor in the prop area (after the space, before ">").
        const cursor = new vscode.Position(0, 16);
        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider', doc.uri, cursor, ' ',
        );
        const variant = list.items.find(i => getLabel(i) === 'variant');
        assert.ok(variant, `expected a 'variant' prop suggestion, got: ${list.items.map(getLabel).slice(0, 12).join(', ')}`);

        console.log(`DEMO> before prop:  "${doc.getText()}"`);
        await acceptItem(editor, variant!);
        const result = doc.getText();
        console.log(`DEMO> after prop:   "${result}"`);

        assert.ok(result.includes('variant='), 'variant attribute should be inserted');
        assert.ok(result.startsWith('<c-atoms.button '), 'tag head stays intact');
    });
});
