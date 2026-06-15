import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CottonRenameProvider } from '../../core/providers/rename-prop';
import { UsageIndex } from '../../core/usage-index';

// ── Helpers ──

function fixturePath(relativePath: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relativePath);
}

const COMPONENT = 'templates/cotton/test/rename-target.html';
const USAGE = 'pages/rename-usage.html';

let originalComponent: string;
let originalUsage: string;

async function getRenameEdits(relativePath: string, position: vscode.Position, newName: string): Promise<vscode.WorkspaceEdit | undefined> {
    const uri = vscode.Uri.file(fixturePath(relativePath));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await new Promise(r => setTimeout(r, 500));

    return vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        'vscode.executeDocumentRenameProvider',
        uri,
        position,
        newName,
    );
}

function getEditsForFile(edit: vscode.WorkspaceEdit, relativePath: string): vscode.TextEdit[] {
    const uri = vscode.Uri.file(fixturePath(relativePath));
    return edit.get(uri);
}

// ── Tests ──

suite('Rename Prop', () => {

    suiteSetup(() => {
        originalComponent = fs.readFileSync(fixturePath(COMPONENT), 'utf-8');
        originalUsage = fs.readFileSync(fixturePath(USAGE), 'utf-8');
    });

    suiteTeardown(() => {
        fs.writeFileSync(fixturePath(COMPONENT), originalComponent, 'utf-8');
        fs.writeFileSync(fixturePath(USAGE), originalUsage, 'utf-8');
    });

    test('prepareRename works on @prop name', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath(COMPONENT));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        // Line 0: {# @prop variant:select... #}
        // "variant" starts after "@prop "
        const result = await vscode.commands.executeCommand<vscode.Range | { range: vscode.Range; placeholder: string }>(
            'vscode.prepareRename',
            uri,
            new vscode.Position(0, 12), // inside "variant"
        );
        assert.ok(result, 'prepareRename should succeed on @prop name');
        const placeholder = (result as { placeholder: string }).placeholder;
        assert.strictEqual(placeholder, 'variant', 'Placeholder should be the prop name');
    });

    test('rename variant → theme updates @prop annotation', async function () {
        this.timeout(15000);
        // Line 0: {# @prop variant:select... → cursor on "variant"
        const edit = await getRenameEdits(COMPONENT, new vscode.Position(0, 12), 'theme');
        assert.ok(edit, 'Should return a WorkspaceEdit');

        const componentEdits = getEditsForFile(edit!, COMPONENT);
        assert.ok(componentEdits.length > 0, 'Should have edits in component file');

        // Check @prop annotation was updated
        const propEdit = componentEdits.find(e => e.newText === 'theme');
        assert.ok(propEdit, 'Should have edit changing variant to theme in @prop');
    });

    test('rename variant → theme updates <c-vars> attribute', async function () {
        this.timeout(15000);
        const edit = await getRenameEdits(COMPONENT, new vscode.Position(0, 12), 'theme');
        assert.ok(edit);

        const componentEdits = getEditsForFile(edit!, COMPONENT);
        // c-vars has variant="primary" — should be renamed
        const cVarsEdits = componentEdits.filter(e => e.newText === 'theme');
        assert.ok(cVarsEdits.length >= 2, `Should update both @prop and c-vars, got ${cVarsEdits.length} edits`);
    });

    test('rename variant → theme updates template body', async function () {
        this.timeout(15000);
        const edit = await getRenameEdits(COMPONENT, new vscode.Position(0, 12), 'theme');
        assert.ok(edit);

        const componentEdits = getEditsForFile(edit!, COMPONENT);
        // Template body has {{ variant }} — should become {{ theme }}
        const bodyEdits = componentEdits.filter(e => e.newText === 'theme');
        // @prop + c-vars + body = at least 3
        assert.ok(bodyEdits.length >= 3, `Should update @prop, c-vars, and body — got ${bodyEdits.length}`);
    });

    test('rename variant → theme updates usage files', async function () {
        this.timeout(15000);
        const edit = await getRenameEdits(COMPONENT, new vscode.Position(0, 12), 'theme');
        assert.ok(edit);

        const usageEdits = getEditsForFile(edit!, USAGE);
        assert.ok(usageEdits.length > 0, 'Should have edits in usage file');

        // rename-usage.html has variant="primary" and variant="secondary"
        const themeEdits = usageEdits.filter(e => e.newText === 'theme');
        assert.ok(themeEdits.length >= 2, `Should update both usages, got ${themeEdits.length}`);
    });

    test('rename kebab prop full-width → is-wide handles snake_case in body', async function () {
        this.timeout(15000);
        // Line 1: {# @prop full-width:boolean... #}  → cursor on "full-width"
        const edit = await getRenameEdits(COMPONENT, new vscode.Position(1, 12), 'is-wide');
        assert.ok(edit);

        const componentEdits = getEditsForFile(edit!, COMPONENT);
        // Template body has full_width (snake) — should become is_wide
        const snakeEdit = componentEdits.find(e => e.newText === 'is_wide');
        assert.ok(snakeEdit, 'Should rename snake_case full_width → is_wide in template body');

        // c-vars has full-width — should become is-wide
        const kebabEdit = componentEdits.find(e => e.newText === 'is-wide');
        assert.ok(kebabEdit, 'Should rename kebab-case full-width → is-wide in c-vars');
    });

    test('rename dynamic prop :count → :total preserves : prefix in usages', async function () {
        this.timeout(15000);
        // Line 2: {# @prop :count:number... #}  → cursor on "count"
        const edit = await getRenameEdits(COMPONENT, new vscode.Position(2, 13), 'total');
        assert.ok(edit);

        const usageEdits = getEditsForFile(edit!, USAGE);
        // rename-usage.html has :count="5" — only "count" should change, : stays
        const totalEdits = usageEdits.filter(e => e.newText === 'total');
        assert.ok(totalEdits.length >= 1, 'Should rename count → total in usage (: prefix preserved by not touching it)');
    });

    test('prepareRename returns undefined for non-cotton (usage) files', async function () {
        this.timeout(10000);
        // Call OUR provider directly — the `vscode.prepareRename` COMMAND
        // aggregates every rename provider (incl. the built-in HTML one, which
        // would happily rename the `variant` attribute), so it can't validate
        // our gate. The provider short-circuits on `!isCottonFile`.
        const uri = vscode.Uri.file(fixturePath(USAGE)); // pages/… → not under templates/cotton
        const doc = await vscode.workspace.openTextDocument(uri);
        const index = new UsageIndex();
        await index.ready;
        const provider = new CottonRenameProvider(index);

        const result = await provider.prepareRename(doc, new vscode.Position(0, 25));
        assert.strictEqual(result, undefined, 'our provider must refuse rename on a non-cotton file');
    });
});
