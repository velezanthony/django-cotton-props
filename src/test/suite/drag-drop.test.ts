import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { CottonDropEditProvider, COTTON_DRAG_MIME } from '../../core/views';

// ── Helpers ──

function fixturePath(relativePath: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relativePath);
}

// ── Drag and Drop ──
// VS Code Electron doesn't support simulating drag events programmatically.
// We test the DocumentDropEditProvider directly by constructing a DataTransfer.

suite('Drag and Drop', () => {

    const provider = new CottonDropEditProvider();

    test('drop provider returns snippet for single component', async function () {
        this.timeout(10000);

        const uri = vscode.Uri.file(fixturePath('pages/valid-usage.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        const position = new vscode.Position(0, 0);

        // Build DataTransfer with our custom MIME type
        const dataTransfer = new vscode.DataTransfer();
        dataTransfer.set(COTTON_DRAG_MIME, new vscode.DataTransferItem(JSON.stringify(['atoms.button'])));

        const edit = await provider.provideDocumentDropEdits(doc, position, dataTransfer);
        assert.ok(edit, 'Should return a DocumentDropEdit');

        const snippet = edit!.insertText;
        assert.ok(snippet instanceof vscode.SnippetString, 'Insert text should be a SnippetString');
        assert.ok(snippet.value.includes('<c-atoms.button'), 'Snippet should contain opening tag');
        assert.ok(snippet.value.includes('</c-atoms.button>'), 'Snippet should contain closing tag');
    });

    test('drop provider returns snippet for multiple components', async function () {
        this.timeout(10000);

        const uri = vscode.Uri.file(fixturePath('pages/valid-usage.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        const position = new vscode.Position(0, 0);

        const dataTransfer = new vscode.DataTransfer();
        dataTransfer.set(COTTON_DRAG_MIME, new vscode.DataTransferItem(
            JSON.stringify(['atoms.button', 'atoms.badge']),
        ));

        const edit = await provider.provideDocumentDropEdits(doc, position, dataTransfer);
        assert.ok(edit, 'Should return a DocumentDropEdit');

        const snippet = edit!.insertText;
        assert.ok(snippet instanceof vscode.SnippetString, 'Should be a SnippetString');
        assert.ok(snippet.value.includes('<c-atoms.button'), 'Should contain button');
        assert.ok(snippet.value.includes('<c-atoms.badge'), 'Should contain badge');
    });

    test('drop provider returns undefined for unknown MIME type', async function () {
        this.timeout(10000);

        const uri = vscode.Uri.file(fixturePath('pages/valid-usage.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        const position = new vscode.Position(0, 0);

        const dataTransfer = new vscode.DataTransfer();
        dataTransfer.set('text/plain', new vscode.DataTransferItem('random text'));

        const edit = await provider.provideDocumentDropEdits(doc, position, dataTransfer);
        assert.strictEqual(edit, undefined, 'Should return undefined for non-cotton drops');
    });

    test('drop provider returns undefined for invalid JSON', async function () {
        this.timeout(10000);

        const uri = vscode.Uri.file(fixturePath('pages/valid-usage.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        const position = new vscode.Position(0, 0);

        const dataTransfer = new vscode.DataTransfer();
        dataTransfer.set(COTTON_DRAG_MIME, new vscode.DataTransferItem('not json'));

        const edit = await provider.provideDocumentDropEdits(doc, position, dataTransfer);
        assert.strictEqual(edit, undefined, 'Should return undefined for invalid data');
    });
});
