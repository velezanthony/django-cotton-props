import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension', () => {

    test('extension is present', () => {
        const ext = vscode.extensions.getExtension('velezanthony.django-cotton-props');
        assert.ok(ext, 'Extension should be installed');
    });

    test('workspace folder is loaded', () => {
        const folders = vscode.workspace.workspaceFolders;
        assert.ok(folders && folders.length > 0, 'Should have a workspace folder');
    });
});
