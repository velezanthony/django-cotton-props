import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

// ── Helpers ──

function fixturePath(relativePath: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relativePath);
}

async function getDiagnostics(relativePath: string, timeout = 5000): Promise<vscode.Diagnostic[]> {
    const uri = vscode.Uri.file(fixturePath(relativePath));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);

    const start = Date.now();
    while (Date.now() - start < timeout) {
        const diags = vscode.languages.getDiagnostics(uri);
        if (diags.length > 0) { return diags; }
        await new Promise(r => setTimeout(r, 200));
    }
    return vscode.languages.getDiagnostics(uri);
}

async function openAndWait(relativePath: string, waitMs = 1500): Promise<vscode.Diagnostic[]> {
    const uri = vscode.Uri.file(fixturePath(relativePath));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await new Promise(r => setTimeout(r, waitMs));
    return vscode.languages.getDiagnostics(uri);
}

function findDiag(diags: vscode.Diagnostic[], substring: string): vscode.Diagnostic | undefined {
    return diags.find(d => d.message.includes(substring));
}

function filterDiags(diags: vscode.Diagnostic[], substring: string): vscode.Diagnostic[] {
    return diags.filter(d => d.message.includes(substring));
}

// ── Component-level diagnostics (real project issues) ──

suite('Diagnostics: Real Component Issues', () => {

    test('badge.html: default mismatch for count (@prop=5 vs c-vars=0)', async () => {
        const diags = await getDiagnostics('templates/cotton/atoms/badge.html');
        const mismatch = findDiag(diags, "Default mismatch for 'count'");
        assert.ok(mismatch, 'Should detect count default mismatch');
        assert.strictEqual(mismatch!.severity, vscode.DiagnosticSeverity.Warning);
    });

    test('chart.html: @prop missing from c-vars (labels, datasets)', async () => {
        const diags = await getDiagnostics('templates/cotton/atoms/chart.html');
        const labels = findDiag(diags, "'labels' defines default");
        const datasets = findDiag(diags, "'datasets' defines default");
        assert.ok(labels, 'Should detect labels missing from c-vars');
        assert.ok(labels!.message.includes('missing from <c-vars>'), 'Should mention missing from c-vars');
        assert.ok(datasets, 'Should detect datasets missing from c-vars');
    });

    test('paginator.html: multiple default mismatches', async () => {
        const diags = await getDiagnostics('templates/cotton/molecules/paginator.html');
        const page = findDiag(diags, "Default mismatch for 'page'");
        const total = findDiag(diags, "Default mismatch for 'total-pages'");
        assert.ok(page, 'Should detect page default mismatch');
        assert.ok(total, 'Should detect total-pages default mismatch');
    });

    test('input-group.html: bare c-vars when @prop has default', async () => {
        const diags = await getDiagnostics('templates/cotton/molecules/input-group.html');
        const bare = filterDiags(diags, 'but <c-vars> has no value');
        assert.ok(bare.length > 0, 'Should detect bare c-vars attr with @prop default');
    });

    test('button.html: well-formed component has no errors', async function () {
        this.timeout(5000);
        const diags = await openAndWait('templates/cotton/atoms/button.html');
        const errors = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
        assert.strictEqual(errors.length, 0, 'Button should have no errors');
    });
});

// ── Component-level diagnostics (synthetic test components) ──

suite('Diagnostics: Synthetic Test Components', () => {

    test('strict-comp: @prop missing from c-vars', async () => {
        const diags = await getDiagnostics('templates/cotton/test/strict-comp.html');
        const missing = findDiag(diags, "@prop 'title' is defined but missing from <c-vars>");
        assert.ok(missing, 'Should detect title missing from c-vars');
    });

    test('deprecated-comp: old-color unused in template', async () => {
        const diags = await getDiagnostics('templates/cotton/test/deprecated-comp.html');
        const unused = findDiag(diags, "'old-color' is defined in <c-vars> but never used");
        assert.ok(unused, 'Should detect unused deprecated prop');
    });
});

// ── Usage-level diagnostics ──

suite('Diagnostics: Component Usage', () => {

    test('component not found', async () => {
        const diags = await getDiagnostics('pages/invalid-usage.html');
        const notFound = findDiag(diags, "component 'atoms.nonexistent' not found");
        assert.ok(notFound, 'Should detect unknown component');
        assert.strictEqual(notFound!.severity, vscode.DiagnosticSeverity.Error);
    });

    test('invalid select value', async () => {
        const diags = await getDiagnostics('pages/invalid-usage.html');
        const invalid = findDiag(diags, "Invalid value 'invalid-value' for 'variant'");
        assert.ok(invalid, 'Should detect invalid select value');
        assert.strictEqual(invalid!.severity, vscode.DiagnosticSeverity.Error);
    });

    test('invalid boolean value', async () => {
        const diags = await getDiagnostics('pages/invalid-usage.html');
        const invalid = findDiag(diags, "Invalid boolean 'maybe' for 'loading'");
        assert.ok(invalid, 'Should detect invalid boolean');
        assert.strictEqual(invalid!.severity, vscode.DiagnosticSeverity.Error);
    });

    test('duplicate prop on same tag', async () => {
        const diags = await getDiagnostics('pages/invalid-usage.html');
        const dup = findDiag(diags, "Duplicate prop 'variant'");
        assert.ok(dup, 'Should detect duplicate prop in usage');
        assert.strictEqual(dup!.severity, vscode.DiagnosticSeverity.Error);
    });

    test('unknown prop in strict mode', async () => {
        const diags = await getDiagnostics('pages/invalid-usage.html');
        const unknown = findDiag(diags, "Unknown prop 'unknown-prop'");
        assert.ok(unknown, 'Should detect unknown prop on strict component');
        assert.ok(unknown!.message.includes('@strict'), 'Should mention strict mode');
    });

    test('missing required props', async () => {
        const diags = await getDiagnostics('pages/invalid-usage.html');
        const missingName = findDiag(diags, "Missing required prop 'name'");
        const missingEmail = findDiag(diags, "Missing required prop 'email'");
        assert.ok(missingName, 'Should detect missing required name');
        assert.ok(missingEmail, 'Should detect missing required email');
    });

    test('deprecated prop usage', async () => {
        const diags = await getDiagnostics('pages/invalid-usage.html');
        const dep = findDiag(diags, "Deprecated prop 'old-color'");
        assert.ok(dep, 'Should detect deprecated prop');
        assert.ok(dep!.message.includes('Use variant instead'), 'Should include deprecation message');
        assert.strictEqual(dep!.severity, vscode.DiagnosticSeverity.Hint);
        assert.ok(dep!.tags?.includes(vscode.DiagnosticTag.Deprecated), 'Should have deprecated tag');
    });

    test('invalid number value', async () => {
        const diags = await getDiagnostics('pages/invalid-usage.html');
        const invalid = findDiag(diags, "Invalid number 'abc'");
        assert.ok(invalid, 'Should detect invalid number');
        assert.strictEqual(invalid!.severity, vscode.DiagnosticSeverity.Error);
    });

    test('valid usage produces no errors', async function () {
        this.timeout(5000);
        const diags = await openAndWait('pages/valid-usage.html');
        const errors = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
        assert.strictEqual(errors.length, 0, `Valid usage should have no errors, got: ${errors.map(e => e.message).join(', ')}`);
    });

    test('dynamic props skip type validation', async function () {
        this.timeout(5000);
        const diags = await openAndWait('pages/valid-usage.html');
        const countDiag = findDiag(diags, "Invalid number");
        assert.strictEqual(countDiag, undefined, 'Dynamic props should not be type-validated');
    });
});

// ── Unused component is NOT a file-level diagnostic any more ──
//
// The "unused component" status moved to the Cotton sidebar tree where it
// shows as a `U` badge on the component item. File diagnostics are reserved
// for actual code issues (malformed @prop, type mismatches, etc.) — a
// component being unused isn't a bug in the file, it's metadata about its
// place in the system. See parity-checks tests for the new behaviour.

suite('Diagnostics: Unused Component (no longer a file diagnostic)', () => {

    test('unused component does NOT produce a file-level warning', async function () {
        this.timeout(10000);
        const diags = await openAndWait('templates/cotton/test/unused-comp.html', 2500);
        const unused = findDiag(diags, "is not used anywhere");
        assert.strictEqual(unused, undefined, 'Unused-component status must live in the tree, not in Problems.');
    });
});
