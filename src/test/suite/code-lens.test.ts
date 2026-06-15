import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

function fixturePath(relativePath: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relativePath);
}

async function getCodeLenses(relativePath: string): Promise<vscode.CodeLens[]> {
    const uri = vscode.Uri.file(fixturePath(relativePath));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    // Wait for UsageIndex to be ready (initial scan takes time)
    await new Promise(r => setTimeout(r, 2500));
    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
        'vscode.executeCodeLensProvider', uri
    );
    return lenses || [];
}

suite('CodeLensProvider', () => {

    test('shows usage count lens on component file', async function () {
        this.timeout(15000);
        const lenses = await getCodeLenses('templates/cotton/atoms/button.html');
        const usageLens = lenses.find(l => l.command?.title.includes('usage'));
        assert.ok(usageLens, `Should have a usage code lens. Got: ${lenses.map(l => l.command?.title).join(' | ')}`);
        assert.ok(usageLens!.command!.title.match(/\d+ usage/), 'Title should include count');
    });

    test('no lens on non-cotton file', async function () {
        this.timeout(15000);
        const lenses = await getCodeLenses('pages/hover-test.html');
        const usageLens = lenses.find(l => l.command?.title.includes('usage'));
        assert.strictEqual(usageLens, undefined, 'Should not show lens on non-cotton file');
    });
});
