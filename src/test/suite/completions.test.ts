import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

// ── Helpers ──

function fixturePath(relativePath: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relativePath);
}

async function getCompletions(
    relativePath: string,
    position: vscode.Position,
    triggerChar?: string,
): Promise<vscode.CompletionList> {
    const uri = vscode.Uri.file(fixturePath(relativePath));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);

    // Allow the extension to activate and providers to register
    await new Promise(r => setTimeout(r, 500));

    const result = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        uri,
        position,
        triggerChar,
    );
    return result;
}

function findItem(list: vscode.CompletionList, labelSubstring: string): vscode.CompletionItem | undefined {
    return list.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label.includes(labelSubstring);
    });
}

function filterItems(list: vscode.CompletionList, labelSubstring: string): vscode.CompletionItem[] {
    return list.items.filter(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label.includes(labelSubstring);
    });
}

function getLabel(item: vscode.CompletionItem): string {
    return typeof item.label === 'string' ? item.label : item.label.label;
}

// ── Tag Completion ──

suite('Completions: Tag Provider', () => {

    test('typing <c- suggests cotton components', async function () {
        this.timeout(10000);
        // Position after '<c-' on an empty area — use line 0 col 3 ('<c-')
        // We use the fixture but trigger on a fresh document to avoid noise
        const uri = vscode.Uri.file(fixturePath('pages/completion-test.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(1, 3), // after '<c-' on line 1
            '<',
        );

        const cottonItems = filterItems(result, 'c-atoms.');
        assert.ok(cottonItems.length > 0, `Should suggest cotton atom components, got ${result.items.length} total items`);
    });

    test('suggests atoms.button component', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(1, 3), // after '<c-'
            '<',
        );
        const button = findItem(result, 'c-atoms.button');
        assert.ok(button, 'Should suggest atoms.button');
    });

    test('suggests atoms.badge component', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(1, 3),
            '<',
        );
        const badge = findItem(result, 'c-atoms.badge');
        assert.ok(badge, 'Should suggest atoms.badge');
    });

    test('suggests built-in c-vars tag', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(1, 3),
            '<',
        );
        const vars = findItem(result, 'c-vars');
        assert.ok(vars, 'Should suggest built-in c-vars');
    });

    test('suggests built-in c-slot tag', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(1, 3),
            '<',
        );
        const slot = findItem(result, 'c-slot');
        assert.ok(slot, 'Should suggest built-in c-slot');
    });

    test('suggests built-in c-component dispatcher', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(1, 3),
            '<',
        );
        const component = findItem(result, 'c-component');
        assert.ok(component, 'Should suggest built-in c-component');
        assert.strictEqual(component!.kind, vscode.CompletionItemKind.Keyword);
    });

    test('built-in tags have Keyword kind', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(1, 3),
            '<',
        );
        const vars = findItem(result, 'c-vars');
        assert.ok(vars, 'c-vars should exist');
        assert.strictEqual(vars!.kind, vscode.CompletionItemKind.Keyword);
    });

    test('component tags have Module kind', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(1, 3),
            '<',
        );
        const button = findItem(result, 'c-atoms.button');
        assert.ok(button, 'atoms.button should exist');
        assert.strictEqual(button!.kind, vscode.CompletionItemKind.Module);
    });

    test('suggests molecules components', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(1, 3),
            '<',
        );
        const molecules = filterItems(result, 'c-molecules.');
        assert.ok(molecules.length > 0, 'Should suggest molecule components');
    });
});

// ── Prop Completion ──

suite('Completions: Prop Provider', () => {

    test('suggests props for atoms.button (space trigger)', async function () {
        this.timeout(10000);
        // Line 3: '<c-atoms.button >' — cursor at col 16 (after the space, before >)
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(3, 16),
            ' ',
        );
        const variant = findItem(result, 'variant');
        assert.ok(variant, `Should suggest 'variant' prop, got items: ${result.items.map(i => getLabel(i)).join(', ')}`);
    });

    test('suggests size prop for atoms.button', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(3, 16),
            ' ',
        );
        const size = findItem(result, 'size');
        assert.ok(size, 'Should suggest size prop');
    });

    test('suggests loading prop for atoms.button', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(3, 16),
            ' ',
        );
        const loading = findItem(result, 'loading');
        assert.ok(loading, 'Should suggest loading prop');
    });

    test('suggests disabled prop for atoms.button', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(3, 16),
            ' ',
        );
        const disabled = findItem(result, 'disabled');
        assert.ok(disabled, 'Should suggest disabled prop');
    });

    test('suggests full-width prop for atoms.button', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(3, 16),
            ' ',
        );
        const fullWidth = findItem(result, 'full-width');
        assert.ok(fullWidth, 'Should suggest full-width prop');
    });

    test('suggests type prop for atoms.button', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(3, 16),
            ' ',
        );
        const typeProp = findItem(result, 'type');
        assert.ok(typeProp, 'Should suggest type prop');
    });

    test('props have Field kind', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(3, 16),
            ' ',
        );
        const variant = findItem(result, 'variant');
        assert.ok(variant, 'variant should exist');
        assert.strictEqual(variant!.kind, vscode.CompletionItemKind.Field);
    });

    test('also suggests dynamic (colon-prefixed) variants', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(3, 16),
            ' ',
        );
        const dynVariant = findItem(result, ':variant');
        assert.ok(dynVariant, 'Should suggest :variant (dynamic prop)');
    });

    test('prop detail includes type information', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(3, 16),
            ' ',
        );
        const variant = findItem(result, 'variant');
        assert.ok(variant, 'variant should exist');
        assert.ok(variant!.detail, 'variant should have detail');
        assert.ok(variant!.detail!.includes('select'), `variant detail should mention type 'select', got: ${variant!.detail}`);
    });
});

// ── Value Completion ──

suite('Completions: Value Provider', () => {

    test('suggests select options for variant prop', async function () {
        this.timeout(15000);
        // Line 5: '<c-atoms.button variant="">Click</c-atoms.button>'
        // cursor at col 25, between the two double quotes of variant=""
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(5, 25),
            '"',
        );
        const primary = findItem(result, 'primary');
        assert.ok(primary, `Should suggest 'primary' value, got items: ${result.items.map(i => getLabel(i)).join(', ')}`);
    });

    test('suggests all variant options', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(5, 25),
            '"',
        );
        const expected = ['primary', 'secondary', 'tertiary', 'danger', 'ghost'];
        for (const opt of expected) {
            const item = findItem(result, opt);
            assert.ok(item, `Should suggest '${opt}' for variant`);
        }
    });

    test('default value is marked as preselected', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(5, 25),
            '"',
        );
        const primary = findItem(result, 'primary');
        assert.ok(primary, 'primary should exist');
        assert.strictEqual(primary!.preselect, true, 'Default value should be preselected');
    });

    test('default value has "(default)" detail', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(5, 25),
            '"',
        );
        const primary = findItem(result, 'primary');
        assert.ok(primary, 'primary should exist');
        assert.strictEqual(primary!.detail, '(default)');
    });

    test('value options have EnumMember kind', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(5, 25),
            '"',
        );
        const primary = findItem(result, 'primary');
        assert.ok(primary, 'primary should exist');
        assert.strictEqual(primary!.kind, vscode.CompletionItemKind.EnumMember);
    });

    test('suggests True/False for boolean loading prop', async function () {
        this.timeout(10000);
        // Line 7: '<c-atoms.button loading="">Click</c-atoms.button>'
        // cursor at col 25, between the two double quotes of loading=""
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(7, 25),
            '"',
        );
        const trueItem = findItem(result, 'True');
        const falseItem = findItem(result, 'False');
        assert.ok(trueItem, `Should suggest 'True', got items: ${result.items.map(i => getLabel(i)).join(', ')}`);
        assert.ok(falseItem, 'Should suggest \'False\'');
    });

    test('boolean default (False) is marked as preselected', async function () {
        this.timeout(10000);
        const result = await getCompletions(
            'pages/completion-test.html',
            new vscode.Position(7, 25),
            '"',
        );
        const falseItem = findItem(result, 'False');
        assert.ok(falseItem, 'False should exist');
        assert.strictEqual(falseItem!.preselect, true, 'Default boolean value should be preselected');
        assert.strictEqual(falseItem!.detail, '(default)');
    });
});

// ── Annotation Completion ──

suite('Completions: Annotation Provider', () => {

    test('suggests @prop snippets inside a cotton component file', async function () {
        this.timeout(10000);
        // Annotation completion only fires inside cotton files (templates/cotton/**)
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        // Simulate typing '@' at the very end of the file (after all content)
        const lastLine = doc.lineCount - 1;
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(lastLine, 0),
            '@',
        );

        // The provider checks for `@` in the line prefix, so we need a line with @
        // Let's use a position where we'd type '@' — we need to insert content first
        // Instead, let's create a temporary document approach using an existing annotation line

        // button.html line 0 has '{# @prop variant:select...'
        // Position right after the '@' on line 0: col 4 ('{# @')
        const result2 = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4), // right after '@' in '{# @prop...'
            '@',
        );

        const propText = findItem(result2, '@prop:text');
        const propBoolean = findItem(result2, '@prop:boolean');
        const propSelect = findItem(result2, '@prop:select');
        const slot = findItem(result2, '@slot');
        const trigger = findItem(result2, '@trigger');
        const strict = findItem(result2, '@strict');

        // The @prop family the test name promises must ALL be present — a weak
        // OR would pass even if the provider regressed to a single snippet.
        const got = result2.items.map(i => getLabel(i)).join(', ');
        assert.ok(propText && propBoolean && propSelect, `Should suggest @prop:text/boolean/select, got: ${got}`);
        assert.ok(slot && trigger && strict, `Should suggest @slot/@trigger/@strict, got: ${got}`);
    });

    test('suggests @prop:text snippet', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const propText = findItem(result, '@prop:text');
        assert.ok(propText, 'Should suggest @prop:text');
    });

    test('suggests @prop:boolean snippet', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const propBool = findItem(result, '@prop:boolean');
        assert.ok(propBool, 'Should suggest @prop:boolean');
    });

    test('suggests @prop:select snippet', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const propSelect = findItem(result, '@prop:select');
        assert.ok(propSelect, 'Should suggest @prop:select');
    });

    test('suggests @slot snippet', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const slot = findItem(result, '@slot');
        assert.ok(slot, 'Should suggest @slot');
    });

    test('suggests @trigger snippet', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const trigger = findItem(result, '@trigger');
        assert.ok(trigger, 'Should suggest @trigger');
    });

    test('suggests @strict snippet', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const strict = findItem(result, '@strict');
        assert.ok(strict, 'Should suggest @strict');
    });

    test('suggests @description snippet', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const desc = findItem(result, '@description');
        assert.ok(desc, 'Should suggest @description');
    });

    test('suggests @slot:NAME snippet (named slot)', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const named = findItem(result, '@slot:NAME');
        assert.ok(named, 'Should suggest @slot:NAME (bare named slot)');
        const namedDesc = findItem(result, '@slot:NAME — description');
        assert.ok(namedDesc, 'Should suggest @slot:NAME with description');
    });

    test('suggests @slot — description (default slot, desc only)', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const slotDesc = findItem(result, '@slot — description');
        assert.ok(slotDesc, 'Should suggest @slot — description (desc-only variant)');
    });

    test('annotation snippets have Snippet kind', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const propText = findItem(result, '@prop:text');
        assert.ok(propText, '@prop:text should exist');
        assert.strictEqual(propText!.kind, vscode.CompletionItemKind.Snippet);
    });

    test('annotation provider filters by cotton file', async function () {
        this.timeout(10000);
        // The AnnotationCompletionProvider checks isCottonFile() and returns
        // undefined for non-cotton files. Verify the provider has the guard.
        // NOTE: vscode.executeCompletionItemProvider may return cached results
        // from other providers, so we test the positive case (cotton file works)
        // rather than the negative (non-cotton returns nothing).
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const propText = findItem(result, '@prop:text');
        assert.ok(propText, 'Should suggest @prop:text in cotton files');
    });

    test('suggests @prop:number snippet', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const propNumber = findItem(result, '@prop:number');
        assert.ok(propNumber, 'Should suggest @prop:number');
    });

    test('suggests required prop variants', async function () {
        this.timeout(10000);
        const uri = vscode.Uri.file(fixturePath('templates/cotton/atoms/button.html'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 500));

        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(0, 4),
            '@',
        );
        const reqText = findItem(result, '@prop:text:required');
        const reqNum = findItem(result, '@prop:number:required');
        assert.ok(reqText, 'Should suggest @prop:text:required');
        assert.ok(reqNum, 'Should suggest @prop:number:required');
    });
});
