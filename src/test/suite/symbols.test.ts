import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

// ── Helpers ──

function fixturePath(relativePath: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relativePath);
}

async function getSymbols(relativePath: string): Promise<vscode.DocumentSymbol[] | undefined> {
    const uri = vscode.Uri.file(fixturePath(relativePath));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider', uri
    );
    return symbols;
}

// ── Symbol Provider ──

suite('CottonSymbolProvider', () => {

    test('button.html: returns symbols for all 6 props', async function () {
        this.timeout(5000);
        const symbols = await getSymbols('templates/cotton/atoms/button.html');
        assert.ok(symbols, 'Should return symbols');
        const propSymbols = symbols!.filter(s => s.kind === vscode.SymbolKind.Property);
        assert.strictEqual(propSymbols.length, 6, `Should have 6 prop symbols, got ${propSymbols.length}`);
    });

    test('button.html: slot symbol exists with Field kind', async function () {
        this.timeout(5000);
        const symbols = await getSymbols('templates/cotton/atoms/button.html');
        assert.ok(symbols, 'Should return symbols');
        const slotSymbol = symbols!.find(s => s.name === 'slot');
        assert.ok(slotSymbol, 'Should have a slot symbol');
        assert.strictEqual(slotSymbol!.kind, vscode.SymbolKind.Field, 'Slot should have Field kind');
    });

    test('button.html: prop symbols have Property kind', async function () {
        this.timeout(5000);
        const symbols = await getSymbols('templates/cotton/atoms/button.html');
        assert.ok(symbols, 'Should return symbols');
        const propSymbols = symbols!.filter(s => s.kind === vscode.SymbolKind.Property);
        assert.ok(propSymbols.length > 0, 'Should have prop symbols');
        for (const prop of propSymbols) {
            assert.strictEqual(prop.kind, vscode.SymbolKind.Property, `${prop.name} should have Property kind`);
        }
    });

    test('button.html: prop symbol detail includes type', async function () {
        this.timeout(5000);
        const symbols = await getSymbols('templates/cotton/atoms/button.html');
        assert.ok(symbols, 'Should return symbols');
        const variantSymbol = symbols!.find(s => s.name === 'variant');
        assert.ok(variantSymbol, 'Should have variant symbol');
        assert.ok(variantSymbol!.detail.includes('select'), `variant detail should include "select", got "${variantSymbol!.detail}"`);
    });

    test('strict-comp.html: @strict symbol exists with Constant kind', async function () {
        this.timeout(5000);
        const symbols = await getSymbols('templates/cotton/test/strict-comp.html');
        assert.ok(symbols, 'Should return symbols');
        const strictSymbol = symbols!.find(s => s.name === '@strict');
        assert.ok(strictSymbol, 'Should have @strict symbol');
        assert.strictEqual(strictSymbol!.kind, vscode.SymbolKind.Constant, '@strict should have Constant kind');
    });

    test('deprecated-comp.html: deprecated prop symbol detail includes "deprecated"', async function () {
        this.timeout(5000);
        const symbols = await getSymbols('templates/cotton/test/deprecated-comp.html');
        assert.ok(symbols, 'Should return symbols');
        const deprecatedSymbol = symbols!.find(s => s.name === 'old-color');
        assert.ok(deprecatedSymbol, 'Should have old-color symbol');
        assert.ok(
            deprecatedSymbol!.detail.includes('deprecated'),
            `old-color detail should include "deprecated", got "${deprecatedSymbol!.detail}"`
        );
    });

    test('non-cotton file returns no cotton symbols', async function () {
        this.timeout(5000);
        const symbols = await getSymbols('pages/valid-usage.html');
        // VS Code may return symbols from other providers (HTML language service).
        // Verify no Cotton-specific symbols (@prop Property, @slot Field, @strict Constant) exist.
        const cottonSymbols = (symbols ?? []).filter(s =>
            s.kind === vscode.SymbolKind.Property ||
            (s.kind === vscode.SymbolKind.Field && s.name === 'slot') ||
            (s.kind === vscode.SymbolKind.Constant && s.name === '@strict')
        );
        assert.strictEqual(cottonSymbols.length, 0, 'Non-cotton file should have no cotton symbols');
    });
});
