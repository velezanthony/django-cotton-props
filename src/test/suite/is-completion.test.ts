import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    IsValueCompletionProvider,
    findIsValueContext,
} from '../../core/providers/is-completion';

// ── Helpers ──

/**
 * Build a single-line document and return the context detected with the cursor
 * placed at the END of `content` (i.e. as if the user just typed it).
 */
async function ctxAtEnd(content: string) {
    const doc = await vscode.workspace.openTextDocument({ content, language: 'html' });
    const pos = new vscode.Position(0, content.length);
    return findIsValueContext(doc, pos);
}

function labelOf(item: vscode.CompletionItem): string {
    return typeof item.label === 'string' ? item.label : item.label.label;
}

// ── findIsValueContext (pure context detection) ──

suite('findIsValueContext', () => {

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('detects an open is="..." and returns the partial typed so far', async () => {
        const ctx = await ctxAtEnd('<c-component is="ato');
        assert.ok(ctx, 'expected a context inside is="');
        assert.strictEqual(ctx!.partial, 'ato');
    });

    test('empty value gives an empty partial', async () => {
        const ctx = await ctxAtEnd('<c-component is="');
        assert.ok(ctx, 'expected a context for an empty is value');
        assert.strictEqual(ctx!.partial, '');
    });

    test('works with single quotes', async () => {
        const ctx = await ctxAtEnd("<c-component is='ato");
        assert.ok(ctx);
        assert.strictEqual(ctx!.partial, 'ato');
    });

    test('ignores the dynamic :is="..." form (expression, not a literal)', async () => {
        const ctx = await ctxAtEnd('<c-component :is="ato');
        assert.strictEqual(ctx, undefined);
    });

    test('returns undefined once the value contains a {{ interpolation', async () => {
        const ctx = await ctxAtEnd('<c-component is="{{ va');
        assert.strictEqual(ctx, undefined);
    });

    test('returns undefined once the value contains a {% tag', async () => {
        const ctx = await ctxAtEnd('<c-component is="{% if');
        assert.strictEqual(ctx, undefined);
    });

    test('returns undefined when the value is already closed', async () => {
        const ctx = await ctxAtEnd('<c-component is="atoms.button"');
        assert.strictEqual(ctx, undefined);
    });

    test('returns undefined after the tag is closed (cursor past >)', async () => {
        const ctx = await ctxAtEnd('<c-component is="atoms.button">');
        assert.strictEqual(ctx, undefined);
    });

    test('does not trigger inside a non-dispatcher tag', async () => {
        const ctx = await ctxAtEnd('<c-atoms.button is="ato');
        assert.strictEqual(ctx, undefined);
    });

    test('does not trigger on plain text', async () => {
        const ctx = await ctxAtEnd('just some text is="ato');
        assert.strictEqual(ctx, undefined);
    });

    test('honours other attributes before is=', async () => {
        const ctx = await ctxAtEnd('<c-component class="x" is="ato');
        assert.ok(ctx);
        assert.strictEqual(ctx!.partial, 'ato');
    });
});

// ── IsValueCompletionProvider (integration with the component scan) ──

suite('IsValueCompletionProvider', () => {

    const provider = new IsValueCompletionProvider();

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    async function complete(content: string): Promise<vscode.CompletionItem[]> {
        const doc = await vscode.workspace.openTextDocument({ content, language: 'html' });
        const pos = new vscode.Position(0, content.length);
        const items = provider.provideCompletionItems(doc, pos);
        return (items as vscode.CompletionItem[]) ?? [];
    }

    test('suggests scanned component tags inside is=""', async function () {
        this.timeout(10000);
        const items = await complete('<c-component is="');
        const labels = items.map(labelOf);
        assert.ok(labels.includes('atoms.button'), `expected atoms.button among ${JSON.stringify(labels)}`);
    });

    test('filters suggestions by the typed prefix', async function () {
        this.timeout(10000);
        const items = await complete('<c-component is="atoms.b');
        const labels = items.map(labelOf);
        assert.ok(labels.length > 0, 'expected at least one prefix match');
        assert.ok(labels.every(l => l.toLowerCase().startsWith('atoms.b')), `all should start with atoms.b: ${JSON.stringify(labels)}`);
    });

    test('suggested items use the Module kind and replace the typed partial', async function () {
        this.timeout(10000);
        const items = await complete('<c-component is="atoms.but');
        const btn = items.find(i => labelOf(i) === 'atoms.button');
        assert.ok(btn, 'expected atoms.button item');
        assert.strictEqual(btn!.kind, vscode.CompletionItemKind.Module);
        assert.ok(btn!.range, 'item should carry a replace range over the partial');
    });

    test('returns nothing for the :is="..." dynamic form', async () => {
        const items = await complete('<c-component :is="ato');
        assert.strictEqual(items.length, 0);
    });
});
