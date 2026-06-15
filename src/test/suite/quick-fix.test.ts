import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DIAG_CODE } from '../../core/constants';

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

async function getCodeActions(uri: vscode.Uri, range: vscode.Range): Promise<vscode.CodeAction[]> {
    return await vscode.commands.executeCommand<vscode.CodeAction[]>(
        'vscode.executeCodeActionProvider', uri, range
    ) ?? [];
}

function findDiag(diags: vscode.Diagnostic[], code: string): vscode.Diagnostic | undefined {
    return diags.find(d => d.code === code);
}

function filterDiags(diags: vscode.Diagnostic[], code: string): vscode.Diagnostic[] {
    return diags.filter(d => d.code === code);
}

function findActionByTitle(actions: vscode.CodeAction[], substring: string): vscode.CodeAction | undefined {
    return actions.find(a => a.title.includes(substring));
}

// ── Quick Fix: Missing from <c-vars> ──

suite('Quick Fix: Missing from <c-vars>', () => {

    test('chart.html: "Add to <c-vars>" action exists for labels', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics('templates/cotton/atoms/chart.html');
        const missingDiags = filterDiags(diags, DIAG_CODE.MISSING_FROM_CVARS);
        assert.ok(missingDiags.length >= 2, `Should have at least 2 missing-from-cvars diagnostics, got ${missingDiags.length}`);

        const labelsDiag = missingDiags.find(d => d.message.includes("'labels'"));
        assert.ok(labelsDiag, 'Should have a diagnostic for labels missing from c-vars');

        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/chart.html'));
        const actions = await getCodeActions(uri, labelsDiag!.range);
        const addAction = findActionByTitle(actions, 'Add to <c-vars>');
        assert.ok(addAction, 'Should have an "Add to <c-vars>" action for labels');
        assert.ok(addAction!.title.includes('labels'), 'Action title should mention labels');
        assert.ok(addAction!.edit, 'Action should have a workspace edit');
        assert.strictEqual(addAction!.kind?.value, vscode.CodeActionKind.QuickFix.value);
    });

    test('chart.html: "Add to <c-vars>" action exists for datasets', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics('templates/cotton/atoms/chart.html');
        const missingDiags = filterDiags(diags, DIAG_CODE.MISSING_FROM_CVARS);
        const datasetsDiag = missingDiags.find(d => d.message.includes("'datasets'"));
        assert.ok(datasetsDiag, 'Should have a diagnostic for datasets missing from c-vars');

        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/chart.html'));
        const actions = await getCodeActions(uri, datasetsDiag!.range);
        const addAction = actions.find(a => a.title.includes('Add to <c-vars>') && a.title.includes('datasets'));
        assert.ok(addAction, 'Should have an "Add to <c-vars>" action mentioning datasets');
    });

    test('chart.html: "Add all missing props" bulk action exists', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics('templates/cotton/atoms/chart.html');
        const missingDiags = filterDiags(diags, DIAG_CODE.MISSING_FROM_CVARS);
        assert.ok(missingDiags.length >= 2, 'Need at least 2 missing diagnostics for bulk action');

        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/chart.html'));
        const actions = await getCodeActions(uri, missingDiags[0].range);
        const bulkAction = findActionByTitle(actions, 'Add all');
        assert.ok(bulkAction, 'Should have an "Add all" bulk action');
        assert.ok(bulkAction!.edit, 'Bulk action should have a workspace edit');
    });

    test('strict-comp.html: "Add to <c-vars>" action for title', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics('templates/cotton/test/strict-comp.html');
        const missingDiag = diags.find(d =>
            d.code === DIAG_CODE.MISSING_FROM_CVARS && d.message.includes("'title'")
        );
        assert.ok(missingDiag, 'Should detect title missing from c-vars');

        const uri = vscode.Uri.file(fixturePath('templates/cotton/test/strict-comp.html'));
        const actions = await getCodeActions(uri, missingDiag!.range);
        const addAction = findActionByTitle(actions, 'Add to <c-vars>');
        assert.ok(addAction, 'Should have "Add to <c-vars>" action for title');
        assert.ok(addAction!.title.includes('title'), 'Action should reference title');
    });
});

// ── Quick Fix: Sync default ──

suite('Quick Fix: Sync <c-vars> default', () => {

    test('badge.html: "Sync <c-vars> default" action for count mismatch', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics('templates/cotton/atoms/badge.html');
        const syncDiag = diags.find(d =>
            d.code === DIAG_CODE.SYNC_DEFAULT && d.message.includes("'count'")
        );
        assert.ok(syncDiag, 'Should detect default mismatch for count');

        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/badge.html'));
        const actions = await getCodeActions(uri, syncDiag!.range);
        const syncAction = findActionByTitle(actions, 'Sync <c-vars> default');
        assert.ok(syncAction, 'Should have a "Sync <c-vars> default" action for count');
        assert.ok(syncAction!.edit, 'Sync action should have a workspace edit');
        assert.strictEqual(syncAction!.kind?.value, vscode.CodeActionKind.QuickFix.value);
        assert.ok(syncAction!.isPreferred, 'Sync action should be preferred');
    });

    test('badge.html: sync action proposes the @prop default value', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics('templates/cotton/atoms/badge.html');
        const syncDiag = diags.find(d =>
            d.code === DIAG_CODE.SYNC_DEFAULT && d.message.includes("'count'")
        );
        assert.ok(syncDiag, 'Should detect count mismatch');

        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/badge.html'));
        const actions = await getCodeActions(uri, syncDiag!.range);
        const syncAction = findActionByTitle(actions, 'Sync <c-vars> default');
        assert.ok(syncAction, 'Should have sync action');
        // @prop says default:5, c-vars has "0", so sync should propose 5
        assert.ok(syncAction!.title.includes('5'), 'Sync action should propose the @prop default (5)');
    });
});

// ── Quick Fix: Document undocumented prop ──

suite('Quick Fix: Document prop', () => {
    const tempFixture = 'templates/cotton/test/undocumented-fixture.html';
    let tempFilePath: string;

    suiteSetup(function () {
        // Create a temp component with an undocumented c-vars attribute
        tempFilePath = fixturePath(tempFixture);
        const content = [
            '{# @prop title:text | default:"Hello" | description:"Title" #}',
            '<c-vars title="Hello" extra-attr="test" />',
            '',
            '<div>{{ title }} {{ extra_attr }}</div>',
        ].join('\n');
        fs.writeFileSync(tempFilePath, content, 'utf-8');
    });

    suiteTeardown(function () {
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    });

    test('"Document prop" action exists for undocumented c-vars attribute', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics(tempFixture);
        const undocDiag = diags.find(d =>
            d.code === DIAG_CODE.UNDOCUMENTED_PROP && d.message.includes("'extra-attr'")
        );
        assert.ok(undocDiag, 'Should detect extra-attr as undocumented');

        const uri = vscode.Uri.file(tempFilePath);
        const actions = await getCodeActions(uri, undocDiag!.range);
        const docAction = findActionByTitle(actions, 'Document prop');
        assert.ok(docAction, 'Should have a "Document prop" action');
        assert.ok(docAction!.edit, 'Document action should have a workspace edit');
        assert.strictEqual(docAction!.kind?.value, vscode.CodeActionKind.QuickFix.value);
    });

    test('"Document prop" action inserts an @prop annotation', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics(tempFixture);
        const undocDiag = diags.find(d =>
            d.code === DIAG_CODE.UNDOCUMENTED_PROP && d.message.includes("'extra-attr'")
        );
        assert.ok(undocDiag, 'Should detect extra-attr as undocumented');

        const uri = vscode.Uri.file(tempFilePath);
        const actions = await getCodeActions(uri, undocDiag!.range);
        const docAction = findActionByTitle(actions, 'Document prop');
        assert.ok(docAction, 'Should have document action');

        // The suggestion in the edit should contain @prop annotation
        assert.ok(docAction!.title.includes('@prop'), 'Action title should contain @prop suggestion');
        assert.ok(docAction!.title.includes('extra-attr'), 'Action title should reference the prop name');
    });
});

// ── Quick Fix: Missing required props (usage files) ──

suite('Quick Fix: Missing required props', () => {

    test('"Add required prop" action for missing name', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics('pages/invalid-usage.html');
        const reqDiag = diags.find(d =>
            d.code === DIAG_CODE.MISSING_REQUIRED && d.message.includes("'name'")
        );
        assert.ok(reqDiag, 'Should detect missing required prop name');

        const uri = vscode.Uri.file(fixturePath('pages/invalid-usage.html'));
        const actions = await getCodeActions(uri, reqDiag!.range);
        const addAction = findActionByTitle(actions, 'Add required prop');
        assert.ok(addAction, 'Should have an "Add required prop" action');
        assert.ok(addAction!.title.includes('name'), 'Action title should reference name');
        assert.ok(addAction!.edit, 'Action should have a workspace edit');
    });

    test('"Add all required props" bulk action', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics('pages/invalid-usage.html');
        const reqDiags = filterDiags(diags, DIAG_CODE.MISSING_REQUIRED);
        assert.ok(reqDiags.length >= 2, `Should have at least 2 missing required diagnostics, got ${reqDiags.length}`);

        const uri = vscode.Uri.file(fixturePath('pages/invalid-usage.html'));
        const actions = await getCodeActions(uri, reqDiags[0].range);
        const bulkAction = findActionByTitle(actions, 'Add all');
        assert.ok(bulkAction, 'Should have "Add all required props" bulk action');
        assert.ok(bulkAction!.edit, 'Bulk action should have a workspace edit');
    });

    test('required prop action inserts correct attribute', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics('pages/invalid-usage.html');
        const reqDiag = diags.find(d =>
            d.code === DIAG_CODE.MISSING_REQUIRED && d.message.includes("'name'")
        );
        assert.ok(reqDiag, 'Should detect missing name');

        const uri = vscode.Uri.file(fixturePath('pages/invalid-usage.html'));
        const actions = await getCodeActions(uri, reqDiag!.range);
        const addAction = actions.find(a => a.title.includes('Add required prop') && a.title.includes('name'));
        assert.ok(addAction, 'Should have action for name');
        assert.ok(addAction!.title.includes('name=""'), 'Should insert text prop with empty value');
    });
});

// ── Quick Fix: Edit integrity ──

suite('Quick Fix: Edit integrity', () => {

    test('Add to <c-vars> edit inserts at the correct position', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics('templates/cotton/atoms/chart.html');
        const missingDiag = diags.find(d =>
            d.code === DIAG_CODE.MISSING_FROM_CVARS && d.message.includes("'labels'")
        );
        assert.ok(missingDiag, 'Should have labels missing diagnostic');

        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/chart.html'));
        const actions = await getCodeActions(uri, missingDiag!.range);
        const addAction = findActionByTitle(actions, 'Add to <c-vars>');
        assert.ok(addAction?.edit, 'Action should have edit');

        // Verify the edit targets the correct document AND inserts the missing
        // 'labels' prop — not just that *an* edit exists.
        const entries = addAction!.edit!.entries();
        assert.ok(entries.length > 0, 'Edit should have at least one entry');
        const [editUri, edits] = entries[0];
        assert.strictEqual(editUri.fsPath, uri.fsPath, 'Edit should target the same file');
        const textEdit = edits[0];
        assert.ok(textEdit.newText.includes('labels'), `inserted text should add the 'labels' attr, got: "${textEdit.newText}"`);
        assert.ok(textEdit.range.isEmpty, 'should be an insertion (empty range), not a replacement');
    });

    test('Sync default edit replaces in the c-vars tag', async function () {
        this.timeout(10000);

        const diags = await getDiagnostics('templates/cotton/atoms/badge.html');
        const syncDiag = diags.find(d =>
            d.code === DIAG_CODE.SYNC_DEFAULT && d.message.includes("'count'")
        );
        assert.ok(syncDiag, 'Should have sync diagnostic');

        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/badge.html'));
        const actions = await getCodeActions(uri, syncDiag!.range);
        const syncAction = findActionByTitle(actions, 'Sync <c-vars> default');
        assert.ok(syncAction?.edit, 'Action should have edit');

        // Verify it actually REPLACES the stale c-vars value with the @prop
        // default (badge.html: @prop :count default:5 vs <c-vars :count="0">).
        const entries = syncAction!.edit!.entries();
        assert.ok(entries.length > 0, 'Edit should have at least one entry');
        const [editUri, edits] = entries[0];
        assert.strictEqual(editUri.fsPath, uri.fsPath, 'Edit should target the same file');
        const textEdit = edits[0];
        assert.ok(!textEdit.range.isEmpty, 'should be a replacement (non-empty range), not an insertion');
        assert.ok(textEdit.newText.includes('5'), `replacement should sync to the @prop default 5, got: "${textEdit.newText}"`);
    });
});
