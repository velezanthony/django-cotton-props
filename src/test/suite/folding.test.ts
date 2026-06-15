import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

function fixturePath(relativePath: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relativePath);
}

async function getFoldingRanges(relativePath: string): Promise<vscode.FoldingRange[]> {
    const uri = vscode.Uri.file(fixturePath(relativePath));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider', uri
    );
    return ranges || [];
}

function cottonRanges(ranges: vscode.FoldingRange[]): vscode.FoldingRange[] {
    return ranges.filter(r => r.kind === vscode.FoldingRangeKind.Region);
}

suite('FoldingProvider', () => {

    test('folds consecutive @prop annotation block', async function () {
        this.timeout(5000);
        const ranges = cottonRanges(await getFoldingRanges('templates/cotton/atoms/button.html'));
        assert.ok(ranges.length >= 1, 'Expected at least one cotton folding range');
        const annotationFold = ranges.find(r => r.start === 0);
        assert.ok(annotationFold, 'Expected fold starting at line 0');
        assert.strictEqual(annotationFold!.start, 0);
        assert.strictEqual(annotationFold!.end, 6, 'Expected fold to end at line 6 (last annotation line)');
    });

    test('does not fold a single annotation', async function () {
        this.timeout(5000);
        const ranges = cottonRanges(await getFoldingRanges('pages/hover-test.html'));
        const singleLineRanges = ranges.filter(r => r.start === r.end);
        assert.strictEqual(singleLineRanges.length, 0, 'Should not create single-line folds');
    });
});
