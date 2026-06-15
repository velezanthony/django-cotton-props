import * as assert from 'assert';
import * as vscode from 'vscode';
import { wrapWithComponent } from '../../core/commands/wrap-selection';

// ── Helpers ──

type QuickPick = typeof vscode.window.showQuickPick;
type InfoMsg = typeof vscode.window.showInformationMessage;

/**
 * Open an untitled HTML doc, show it, and select the whole first line (or the
 * explicit range). Untitled docs never touch git, so wrapping them is safe.
 */
async function openWithSelection(content: string, selection?: vscode.Selection): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument({ content, language: 'html' });
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = selection ?? new vscode.Selection(
        new vscode.Position(0, 0),
        doc.lineAt(doc.lineCount - 1).range.end,
    );
    return editor;
}

suite('wrapWithComponent', () => {

    let originalQuickPick: QuickPick;
    let originalInfo: InfoMsg;
    let infoMessages: string[];

    setup(() => {
        originalQuickPick = vscode.window.showQuickPick;
        originalInfo = vscode.window.showInformationMessage;
        infoMessages = [];
        // Capture info messages instead of popping real toasts.
        (vscode.window as unknown as { showInformationMessage: unknown }).showInformationMessage =
            (async (msg: string) => { infoMessages.push(msg); return undefined; }) as InfoMsg;
    });

    teardown(async () => {
        (vscode.window as unknown as { showQuickPick: unknown }).showQuickPick = originalQuickPick;
        (vscode.window as unknown as { showInformationMessage: unknown }).showInformationMessage = originalInfo;
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    /** Force the quick pick to resolve to the component whose label matches. */
    function pickComponent(label: string) {
        (vscode.window as unknown as { showQuickPick: unknown }).showQuickPick =
            (async (items: vscode.QuickPickItem[] | Thenable<vscode.QuickPickItem[]>) => {
                const resolved = await items;
                return resolved.find(i => i.label === label);
            }) as unknown as QuickPick;
    }

    test('wraps the selection with the chosen component open/close tags', async function () {
        this.timeout(10000);
        pickComponent('c-atoms.button');
        const editor = await openWithSelection('<p>hello</p>');

        await wrapWithComponent();

        const text = editor.document.getText();
        assert.ok(text.includes('<c-atoms.button'), `expected open tag, got:\n${text}`);
        assert.ok(text.includes('</c-atoms.button>'), `expected close tag, got:\n${text}`);
        assert.ok(text.includes('<p>hello</p>'), 'original selection must be preserved inside the wrap');
    });

    test('expands the component props inside the opening tag', async function () {
        this.timeout(10000);
        pickComponent('c-atoms.button');
        const editor = await openWithSelection('<p>hello</p>');

        await wrapWithComponent();

        const text = editor.document.getText();
        // atoms.button declares variant/size/... with defaults — they should be pre-filled.
        assert.ok(text.includes('variant="primary"'), `expected variant prop expanded, got:\n${text}`);
        assert.ok(text.includes('size="md"'), `expected size prop expanded, got:\n${text}`);
    });

    test('keeps the wrapped content between the tags', async function () {
        this.timeout(10000);
        pickComponent('c-atoms.button');
        const editor = await openWithSelection('<p>hello</p>');

        await wrapWithComponent();

        const text = editor.document.getText();
        const openEnd = text.indexOf('>\n');           // end of the multi-line open tag
        const closeStart = text.indexOf('</c-atoms.button>');
        const inner = text.substring(openEnd, closeStart);
        assert.ok(inner.includes('<p>hello</p>'), 'selection must sit between open and close tags');
    });

    test('does nothing and warns when the selection is empty', async function () {
        this.timeout(10000);
        pickComponent('c-atoms.button');
        const editor = await openWithSelection(
            '<p>hello</p>',
            new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0)),
        );
        const before = editor.document.getText();

        await wrapWithComponent();

        assert.strictEqual(editor.document.getText(), before, 'document must be untouched for an empty selection');
        assert.ok(infoMessages.some(m => /select/i.test(m)), 'expected a "select some HTML first" message');
    });

    test('aborts cleanly when the user dismisses the quick pick', async function () {
        this.timeout(10000);
        // Quick pick returns undefined → user cancelled.
        (vscode.window as unknown as { showQuickPick: unknown }).showQuickPick =
            (async () => undefined) as unknown as QuickPick;
        const editor = await openWithSelection('<p>hello</p>');
        const before = editor.document.getText();

        await wrapWithComponent();

        assert.strictEqual(editor.document.getText(), before, 'cancelling must leave the document unchanged');
    });
});
