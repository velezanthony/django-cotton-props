import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

function fixturePath(relativePath: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relativePath);
}

async function getInlayHints(relativePath: string): Promise<vscode.InlayHint[]> {
    const uri = vscode.Uri.file(fixturePath(relativePath));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        doc.lineAt(doc.lineCount - 1).range.end
    );
    const hints = await vscode.commands.executeCommand<vscode.InlayHint[]>(
        'vscode.executeInlayHintProvider', uri, fullRange
    );
    return hints || [];
}

function labelText(hint: vscode.InlayHint): string {
    return typeof hint.label === 'string'
        ? hint.label
        : hint.label.map(p => p.value).join('');
}

suite('InlayHintsProvider', () => {

    test('shows defaults for unset props', async function () {
        this.timeout(10000);
        const hints = await getInlayHints('pages/hover-test.html');
        // Line 0: <c-atoms.button variant="primary" size="md">...</c-atoms.button>
        // variant + size are passed → inlay should NOT list them
        // type, loading, full-width, disabled have defaults → should appear
        const texts = hints.map(labelText);
        const joined = texts.join(' ');
        assert.ok(joined.includes('loading'), `Expected 'loading' inlay. Got: ${joined}`);
        assert.ok(joined.includes('disabled'), `Expected 'disabled' inlay`);
        assert.ok(!texts.some(t => t.includes('variant=')), 'Should not show inlay for passed prop variant');
        assert.ok(!texts.some(t => t.includes('size=')), 'Should not show inlay for passed prop size');
    });

    test('hints are InlayHintKind.Parameter', async function () {
        this.timeout(10000);
        const hints = await getInlayHints('pages/hover-test.html');
        // The fixture is known to produce default-value hints (asserted by the
        // sibling test). An empty result here means the provider broke — FAIL,
        // never silently skip.
        assert.ok(hints.length > 0, 'expected at least one inlay hint on hover-test.html');
        const hint = hints[0];
        assert.strictEqual(hint.kind, vscode.InlayHintKind.Parameter);
    });
});
