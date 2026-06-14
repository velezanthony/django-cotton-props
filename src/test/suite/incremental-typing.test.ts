import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ── Typing Helpers ──

function fixturePath(relativePath: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, relativePath);
}

async function openClean(relativePath: string): Promise<vscode.TextEditor> {
    const filePath = fixturePath(relativePath);
    fs.writeFileSync(filePath, '\n', 'utf-8');
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    // Position cursor at start
    editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    await new Promise(r => setTimeout(r, 300));
    return editor;
}

async function typeText(editor: vscode.TextEditor, text: string): Promise<void> {
    const pos = editor.selection.active;
    await editor.edit(b => b.insert(pos, text));
    const newPos = editor.document.positionAt(editor.document.offsetAt(pos) + text.length);
    editor.selection = new vscode.Selection(newPos, newPos);
    await new Promise(r => setTimeout(r, 100));
}

async function backspace(editor: vscode.TextEditor, count: number): Promise<void> {
    const pos = editor.selection.active;
    const startOffset = Math.max(0, editor.document.offsetAt(pos) - count);
    const start = editor.document.positionAt(startOffset);
    await editor.edit(b => b.delete(new vscode.Range(start, pos)));
    editor.selection = new vscode.Selection(start, start);
    await new Promise(r => setTimeout(r, 100));
}

async function completionsHere(editor: vscode.TextEditor, trigger?: string): Promise<vscode.CompletionList> {
    return await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        editor.document.uri,
        editor.selection.active,
        trigger,
    ) ?? { items: [], isIncomplete: false };
}

function getLabel(item: vscode.CompletionItem): string {
    return typeof item.label === 'string' ? item.label : item.label.label;
}

function findItems(result: vscode.CompletionList, substring: string): vscode.CompletionItem[] {
    return result.items.filter(i => getLabel(i).includes(substring));
}

// ── Incremental Tag Completion ──

suite('Incremental Typing: Tag Completion', () => {

    const fixture = 'pages/typing-test.html';

    test('typing < then c- suggests cotton components', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        await typeText(editor, '<');
        await typeText(editor, 'c-');
        const result = await completionsHere(editor, '<');

        const cottonItems = findItems(result, 'c-');
        assert.ok(cottonItems.length > 10, `Should suggest many components after <c-, got ${cottonItems.length}`);

        const hasButton = cottonItems.some(i => getLabel(i).includes('atoms.button'));
        assert.ok(hasButton, 'Should include atoms.button');
    });

    test('continuing to type atoms filters to atoms category', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        await typeText(editor, '<c-atoms');
        const result = await completionsHere(editor, '<');

        const cottonItems = findItems(result, 'c-atoms.');
        assert.ok(cottonItems.length > 0, `Should have atoms components, got ${cottonItems.length}`);

        // Should NOT include molecules
        const moleculeItems = findItems(result, 'c-molecules.');
        assert.strictEqual(moleculeItems.length, 0, 'Should not include molecules when typing atoms');
    });

    test('typing atoms.b filters to badge and button', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        await typeText(editor, '<c-atoms.b');
        const result = await completionsHere(editor, '<');

        const cottonItems = findItems(result, 'c-atoms.b');
        assert.ok(cottonItems.length >= 2, `Should have at least badge + button, got ${cottonItems.length}`);

        const labels = cottonItems.map(i => getLabel(i));
        assert.ok(labels.some(l => l.includes('badge')), 'Should include badge');
        assert.ok(labels.some(l => l.includes('button')), 'Should include button');
    });

    test('backspacing from atoms.b to c- restores all components', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        // Type full path
        await typeText(editor, '<c-atoms.b');
        const filtered = await completionsHere(editor, '<');
        const filteredCount = findItems(filtered, 'c-').length;

        // Backspace to <c-
        await backspace(editor, 'atoms.b'.length);
        const restored = await completionsHere(editor, '<');
        const restoredCount = findItems(restored, 'c-').length;

        assert.ok(restoredCount > filteredCount, `Backspacing should restore more components: ${restoredCount} > ${filteredCount}`);
    });

    test('typing molecules. filters to molecules only', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        await typeText(editor, '<c-molecules.');
        const result = await completionsHere(editor, '<');

        const moleculeItems = findItems(result, 'c-molecules.');
        assert.ok(moleculeItems.length >= 3, `Should have many molecule components, got ${moleculeItems.length}`);

        const atomItems = findItems(result, 'c-atoms.');
        assert.strictEqual(atomItems.length, 0, 'Should not include atoms when typing molecules');
    });

    test('mid-word completion replaceRange consumes chars after cursor', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        // Simulate: user typed <c-atoms.button> then cursor is mid-word
        await typeText(editor, '<c-atoms.button>content</c-atoms.button>');
        // Move cursor to after "butto" in the opening tag (position 15 = end of "button", go back 1)
        const midPos = new vscode.Position(0, 14); // after "butto", before "n"
        editor.selection = new vscode.Selection(midPos, midPos);

        const result = await completionsHere(editor, '<');

        // The completion for atoms.button should exist
        const buttonItem = result.items.find(i => getLabel(i).includes('atoms.button'));
        assert.ok(buttonItem, 'Should suggest atoms.button even mid-word');

        // The range should consume the remaining "n" after cursor
        if (buttonItem!.range) {
            const range = buttonItem!.range instanceof vscode.Range
                ? buttonItem!.range
                : (buttonItem!.range as { replacing: vscode.Range }).replacing;
            // Range end should be PAST the cursor (consuming "n")
            assert.ok(range.end.character > midPos.character, `Range end (${range.end.character}) should be past cursor (${midPos.character})`);
        }
    });

    test('rename mode completion includes additionalTextEdits for closing tag', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        // Write a complete tag pair, then position cursor mid-word in opening tag
        await typeText(editor, '<c-atoms.badge>content</c-atoms.badge>');
        // Position cursor inside "badge" in opening tag: <c-atoms.b|adge>
        const midPos = new vscode.Position(0, 10); // after "atoms.b"
        editor.selection = new vscode.Selection(midPos, midPos);

        const result = await completionsHere(editor, '<');

        // Find the button completion (different from badge)
        const buttonItem = result.items.find(i => getLabel(i).includes('atoms.button'));
        assert.ok(buttonItem, 'Should suggest atoms.button for rename');

        // Should have additionalTextEdits to update closing tag
        assert.ok(
            buttonItem!.additionalTextEdits && buttonItem!.additionalTextEdits.length > 0,
            'Rename completion should include additionalTextEdits for closing tag'
        );

        // The edit should replace </c-atoms.badge> with </c-atoms.button>
        const closingEdit = buttonItem!.additionalTextEdits![0];
        assert.ok(
            closingEdit.newText.includes('</c-atoms.button>'),
            `Closing tag edit should be </c-atoms.button>, got: ${closingEdit.newText}`
        );
    });

    test('built-in tags appear with c- prefix', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        await typeText(editor, '<c-');
        const result = await completionsHere(editor, '<');

        const vars = findItems(result, 'c-vars');
        const slot = findItems(result, 'c-slot');
        assert.ok(vars.length > 0, 'Should include c-vars');
        assert.ok(slot.length > 0, 'Should include c-slot');
    });
});

// ── Incremental Prop Completion ──

suite('Incremental Typing: Prop Completion', () => {

    const fixture = 'pages/typing-test.html';

    test('typing space inside tag suggests all props', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        await typeText(editor, '<c-atoms.button ');
        const result = await completionsHere(editor, ' ');

        const propItems = result.items.filter(i =>
            getLabel(i) === 'variant' || getLabel(i) === 'size' ||
            getLabel(i) === 'loading' || getLabel(i) === 'disabled' ||
            getLabel(i) === 'type' || getLabel(i) === 'full-width'
        );
        assert.ok(propItems.length >= 5, `Should suggest button props, got: ${result.items.map(i => getLabel(i)).slice(0, 20).join(', ')}`);
    });

    test('still suggests props after a partial prop name is typed', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        await typeText(editor, '<c-atoms.button va');
        const result = await completionsHere(editor, ' ');

        // The provider returns ALL props (it does not filter by the typed
        // partial — VS Code does client-side filtering). So `variant` MUST be
        // present; a weak `|| items.length > 0` would mask a real regression.
        const variantItem = result.items.find(i => getLabel(i) === 'variant');
        assert.ok(variantItem, `Should still offer 'variant', got: ${result.items.map(i => getLabel(i)).join(', ')}`);
    });

    test('adding second prop after first still suggests', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        await typeText(editor, '<c-atoms.button variant="primary" ');
        const result = await completionsHere(editor, ' ');

        // Should still suggest remaining props (size, loading, etc.)
        const sizeItem = result.items.find(i => getLabel(i) === 'size');
        const loadingItem = result.items.find(i => getLabel(i) === 'loading');
        assert.ok(sizeItem, 'Should suggest size after first prop is set');
        assert.ok(loadingItem, 'Should suggest loading after first prop is set');
    });

    test('switching component changes available props', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        // Type button tag → get button props
        await typeText(editor, '<c-atoms.button ');
        const buttonResult = await completionsHere(editor, ' ');
        const hasVariant = buttonResult.items.some(i => getLabel(i) === 'variant');

        // Clear and type badge tag → get badge props
        await backspace(editor, '<c-atoms.button '.length);
        await typeText(editor, '<c-atoms.badge ');
        const badgeResult = await completionsHere(editor, ' ');

        // badge has :count and :max, not variant
        const hasCount = badgeResult.items.some(i => getLabel(i) === 'count' || getLabel(i) === ':count');

        assert.ok(hasVariant, 'Button should have variant prop');
        assert.ok(hasCount, 'Badge should have count prop');
    });
});

// ── Incremental Value Completion ──

suite('Incremental Typing: Value Completion', () => {

    const fixture = 'pages/typing-test.html';

    test('typing opening quote after prop shows select options', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        await typeText(editor, '<c-atoms.button variant="');
        const result = await completionsHere(editor, '"');

        const options = result.items.filter(i =>
            ['primary', 'secondary', 'tertiary', 'danger', 'ghost'].includes(getLabel(i))
        );
        assert.ok(options.length >= 3, `Should suggest variant options, got: ${result.items.map(i => getLabel(i)).join(', ')}`);
    });

    test('default value is preselected', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        await typeText(editor, '<c-atoms.button variant="');
        const result = await completionsHere(editor, '"');

        const primary = result.items.find(i => getLabel(i) === 'primary');
        assert.ok(primary, 'Should have primary option');
        assert.strictEqual(primary!.preselect, true, 'Default value should be preselected');
    });

    test('boolean prop shows True/False', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        await typeText(editor, '<c-atoms.button loading="');
        const result = await completionsHere(editor, '"');

        const trueItem = result.items.find(i => getLabel(i) === 'True');
        const falseItem = result.items.find(i => getLabel(i) === 'False');
        assert.ok(trueItem, 'Should suggest True');
        assert.ok(falseItem, 'Should suggest False');
    });

    test('different prop shows different options', async function () {
        this.timeout(15000);
        const editor = await openClean(fixture);

        // size prop has sm, md, lg
        await typeText(editor, '<c-atoms.button size="');
        const result = await completionsHere(editor, '"');

        const options = result.items.filter(i =>
            ['sm', 'md', 'lg'].includes(getLabel(i))
        );
        assert.ok(options.length === 3, `Should suggest sm, md, lg — got: ${result.items.map(i => getLabel(i)).join(', ')}`);
    });
});

// ── Incremental Annotation Completion ──

suite('Incremental Typing: Annotation Completion', () => {

    const cottonFixture = 'templates/cotton/test/typing-annotation.html';
    let originalContent: string;

    suiteSetup(() => {
        originalContent = fs.readFileSync(fixturePath(cottonFixture), 'utf-8');
    });

    suiteTeardown(() => {
        fs.writeFileSync(fixturePath(cottonFixture), originalContent, 'utf-8');
    });

    async function openWithContent(content: string): Promise<vscode.TextEditor> {
        const uri = vscode.Uri.file(fixturePath(cottonFixture));
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        const fullRange = new vscode.Range(
            new vscode.Position(0, 0),
            doc.lineAt(doc.lineCount - 1).range.end,
        );
        await editor.edit(b => b.replace(fullRange, content));
        await new Promise(r => setTimeout(r, 300));
        return editor;
    }

    test('typing {# @ suggests annotation snippets', async function () {
        this.timeout(15000);
        const editor = await openWithContent('{# @\n<c-vars />\n');
        editor.selection = new vscode.Selection(new vscode.Position(0, 4), new vscode.Position(0, 4));

        const result = await completionsHere(editor, '@');

        const propText = result.items.find(i => getLabel(i) === '@prop:text');
        const slot = result.items.find(i => getLabel(i) === '@slot');
        const strict = result.items.find(i => getLabel(i) === '@strict');
        assert.ok(propText, `Should suggest @prop:text — got: ${result.items.map(i => getLabel(i)).join(', ')}`);
        assert.ok(slot, 'Should suggest @slot');
        assert.ok(strict, 'Should suggest @strict');
    });

    test('typing @prop filters to prop variants only', async function () {
        this.timeout(15000);
        const editor = await openWithContent('{# @prop\n<c-vars />\n');
        editor.selection = new vscode.Selection(new vscode.Position(0, 8), new vscode.Position(0, 8));

        const result = await completionsHere(editor, '@');

        const propItems = result.items.filter(i => getLabel(i).startsWith('@prop'));
        const slotItem = result.items.find(i => getLabel(i) === '@slot');
        assert.ok(propItems.length >= 4, `Should have prop variants, got ${propItems.length}`);
        assert.strictEqual(slotItem, undefined, '@slot should be filtered out when typing @prop');
    });

    test('typing @prop: further narrows to type-specific variants', async function () {
        this.timeout(15000);
        const editor = await openWithContent('{# @prop:b\n<c-vars />\n');
        editor.selection = new vscode.Selection(new vscode.Position(0, 10), new vscode.Position(0, 10));

        const result = await completionsHere(editor, ':');

        const boolItem = result.items.find(i => getLabel(i) === '@prop:boolean');
        assert.ok(boolItem, 'Should suggest @prop:boolean when typing @prop:b');
    });
});

// ── Incremental Auto-Rename Tag ──

suite('Incremental Typing: Auto-Rename Tag', () => {

    const fixture = 'pages/auto-rename-typing.html';
    const initialContent = '<c-atoms.button>Click</c-atoms.button>\n';

    suiteSetup(() => {
        fs.writeFileSync(fixturePath(fixture), initialContent, 'utf-8');
    });

    suiteTeardown(() => {
        fs.writeFileSync(fixturePath(fixture), initialContent, 'utf-8');
    });

    test('typing character in opening tag renames closing tag', async function () {
        this.timeout(15000);

        // Reset content via editor.edit to bypass VS Code's TextDocument cache —
        // fs.writeFileSync alone does NOT update an already-open buffer.
        const uri = vscode.Uri.file(fixturePath(fixture));
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        const fullRange = new vscode.Range(
            new vscode.Position(0, 0),
            doc.lineAt(doc.lineCount - 1).range.end,
        );
        await editor.edit(b => b.replace(fullRange, initialContent));
        // Wait for the auto-rename debounce to drain on the reset edit.
        await new Promise(r => setTimeout(r, 200));

        // Insert 'x' right after "button" via editor.edit — `type` command
        // depends on keyboard focus which is unreliable in Electron headless.
        // The auto-rename listener fires on `onDidChangeTextDocument`, so an
        // edit-driven insert triggers the same code path as user typing.
        const insertPos = new vscode.Position(0, 15);
        await editor.edit(b => b.insert(insertPos, 'x'));
        // Auto-rename debounce is 40ms; give it room plus a margin for the
        // counterpart-edit await chain.
        await new Promise(r => setTimeout(r, 1500));

        const updated = editor.document.getText();
        assert.ok(
            updated.includes('</c-atoms.buttonx>'),
            `Closing tag should be renamed to buttonx. Got:\n${updated}`
        );
    });
});
