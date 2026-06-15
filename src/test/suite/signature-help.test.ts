import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

function fixturePath(relativePath: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relativePath);
}

async function getSignatureHelp(
    relativePath: string,
    line: number,
    character: number,
): Promise<vscode.SignatureHelp | undefined> {
    const uri = vscode.Uri.file(fixturePath(relativePath));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    const position = new vscode.Position(line, character);
    return await vscode.commands.executeCommand<vscode.SignatureHelp>(
        'vscode.executeSignatureHelpProvider', uri, position
    );
}

suite('SignatureHelpProvider', () => {

    // hover-test.html line 0:
    // "<c-atoms.button variant="primary" size="md">Click</c-atoms.button>"
    //  0123456789012345678901234567890123456789
    //  0         1         2         3

    test('returns signature at tag open', async function () {
        this.timeout(10000);
        // Position just after "<c-atoms.button " (col 16 = space after tag name)
        const help = await getSignatureHelp('pages/hover-test.html', 0, 16);
        assert.ok(help, 'Should return signature help');
        assert.strictEqual(help!.signatures.length, 1);
        assert.ok(help!.signatures[0].label.includes('c-atoms.button'));
        assert.ok(help!.signatures[0].label.includes('variant'));
    });

    test('signature has parameters', async function () {
        this.timeout(10000);
        const help = await getSignatureHelp('pages/hover-test.html', 0, 16);
        assert.ok(help);
        const params = help!.signatures[0].parameters;
        assert.ok(params.length >= 4, `Expected at least 4 params, got ${params.length}`);
        const paramStrings = params.map(p => {
            const r = p.label as [number, number];
            return help!.signatures[0].label.substring(r[0], r[1]);
        });
        assert.ok(paramStrings.some(p => p.startsWith('variant')), 'Should have variant param');
        assert.ok(paramStrings.some(p => p.startsWith('size')), 'Should have size param');
    });

    test('no signature outside cotton tag', async function () {
        this.timeout(10000);
        // Line 1 is <div>, not cotton
        const help = await getSignatureHelp('pages/hover-test.html', 1, 5);
        assert.ok(!help || help.signatures.length === 0, 'Should not return signature outside cotton');
    });
});
