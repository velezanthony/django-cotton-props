import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ── Helpers ──

function fixturePath(relativePath: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relativePath);
}

// ── Auto Rename Tag (stateless redesign) ──
// The stateless approach checks if opening/closing names match on every change.
// No global state — works with rapid typing, bulk edits, and held backspace.

suite('AutoRenameTag', () => {

    const fixture = 'pages/auto-rename-test.html';
    let originalContent: string;

    suiteSetup(() => {
        originalContent = fs.readFileSync(fixturePath(fixture), 'utf-8');
    });

    suiteTeardown(() => {
        fs.writeFileSync(fixturePath(fixture), originalContent, 'utf-8');
    });

    test('editing a tag does not affect unrelated tags', async function () {
        this.timeout(10000);

        fs.writeFileSync(fixturePath(fixture), originalContent, 'utf-8');
        const uri = vscode.Uri.file(fixturePath(fixture));
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);

        const text = editor.document.getText();
        const alertClose = text.indexOf('</c-atoms.alert>');
        assert.ok(alertClose !== -1, 'Should find alert closing tag');

        const nameStart = editor.document.positionAt(alertClose + 2);
        const nameEnd = editor.document.positionAt(alertClose + 2 + 'c-atoms.alert'.length);

        await editor.edit(b => b.replace(new vscode.Range(nameStart, nameEnd), 'c-atoms.callout'));
        await new Promise(r => setTimeout(r, 1500));

        const updated = editor.document.getText();
        assert.ok(updated.includes('<c-atoms.button'), 'Button opening tag should be preserved');
        assert.ok(updated.includes('</c-atoms.button>'), 'Button closing tag should be preserved');
        assert.ok(updated.includes('<c-atoms.badge'), 'Badge tag should be preserved');
    });

    test('bulk edit on closing tag syncs opening tag', async function () {
        this.timeout(10000);

        const content = '<c-atoms.badge>text</c-atoms.badge>\n';
        fs.writeFileSync(fixturePath(fixture), content, 'utf-8');
        // Close previous editor so VS Code re-reads from disk
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await new Promise(r => setTimeout(r, 300));

        const uri = vscode.Uri.file(fixturePath(fixture));
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        // Replace closing tag name: c-atoms.badge → c-atoms.icon
        const text = editor.document.getText();
        const closeStart = text.indexOf('</c-atoms.badge>') + 2;
        assert.ok(closeStart > 1, `Should find closing badge tag. Text: ${text}`);
        const nameStart = editor.document.positionAt(closeStart);
        const nameEnd = editor.document.positionAt(closeStart + 'c-atoms.badge'.length);

        await editor.edit(b => b.replace(new vscode.Range(nameStart, nameEnd), 'c-atoms.icon'));
        await new Promise(r => setTimeout(r, 1500));

        const updated = editor.document.getText();
        assert.ok(
            updated.includes('<c-atoms.icon'),
            `Opening tag should sync to icon. Got:\n${updated}`
        );
    });
});
