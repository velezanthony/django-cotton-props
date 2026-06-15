import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    buildDescription,
    buildCategoryDescription,
    ComponentTreeProvider,
    type CategoryAggregate,
} from '../../core/views/component-tree';
import { CottonTreeDecorationProvider } from '../../core/views/tree-decorations';
import type { SeverityCounts } from '../../core/views/tree-shared';

const ZERO: SeverityCounts = { error: 0, warning: 0, info: 0, hint: 0 };

function agg(partial: Partial<CategoryAggregate> = {}): CategoryAggregate {
    return { counts: { ...ZERO }, unusedCount: 0, ...partial };
}

suite('ComponentTree: buildDescription', () => {

    test('shows just prop count when component has no diagnostics and is used', () => {
        assert.strictEqual(buildDescription(3, ZERO, false), '3 props');
    });

    test('hides prop count when component has zero props', () => {
        assert.strictEqual(buildDescription(0, ZERO, false), '');
    });

    test('appends "unused" tag when component is unused', () => {
        assert.strictEqual(buildDescription(3, ZERO, true), '3 props · unused');
    });

    test('renders error count with E suffix', () => {
        const counts: SeverityCounts = { error: 2, warning: 0, info: 0, hint: 0 };
        assert.strictEqual(buildDescription(3, counts, false), '3 props · 2E');
    });

    test('renders warning count with W suffix', () => {
        const counts: SeverityCounts = { error: 0, warning: 1, info: 0, hint: 0 };
        assert.strictEqual(buildDescription(3, counts, false), '3 props · 1W');
    });

    test('renders hint count with H suffix', () => {
        const counts: SeverityCounts = { error: 0, warning: 0, info: 0, hint: 4 };
        assert.strictEqual(buildDescription(3, counts, false), '3 props · 4H');
    });

    test('stacks all severities side by side', () => {
        const counts: SeverityCounts = { error: 2, warning: 1, info: 0, hint: 3 };
        assert.strictEqual(buildDescription(5, counts, false), '5 props · 2E 1W 3H');
    });

    test('stacks severities + unused tag together', () => {
        const counts: SeverityCounts = { error: 0, warning: 1, info: 0, hint: 0 };
        assert.strictEqual(buildDescription(2, counts, true), '2 props · 1W · unused');
    });

    test('order: props · severities · unused (unused comes last)', () => {
        const counts: SeverityCounts = { error: 1, warning: 0, info: 0, hint: 0 };
        const out = buildDescription(2, counts, true);
        assert.ok(out.indexOf('2 props') < out.indexOf('1E'));
        assert.ok(out.indexOf('1E') < out.indexOf('unused'));
    });

    test('zero-props + only severities renders just severities', () => {
        const counts: SeverityCounts = { error: 0, warning: 2, info: 0, hint: 0 };
        assert.strictEqual(buildDescription(0, counts, false), '2W');
    });

    test('zero-props + only unused renders just "unused"', () => {
        assert.strictEqual(buildDescription(0, ZERO, true), 'unused');
    });

    test('renders info count with I suffix when used', () => {
        const counts: SeverityCounts = { error: 0, warning: 0, info: 2, hint: 0 };
        assert.strictEqual(buildDescription(1, counts, false), '1 props · 2I');
    });
});

suite('ComponentTree: buildCategoryDescription', () => {

    test('shows only the count when the category has no diagnostics and nothing unused', () => {
        assert.strictEqual(buildCategoryDescription(59, agg()), '59');
    });

    test('appends aggregated severity counts after the category count', () => {
        const a = agg({ counts: { error: 4, warning: 2, info: 0, hint: 8 } });
        assert.strictEqual(buildCategoryDescription(59, a), '59 · 4E 2W 8H');
    });

    test('appends "N unused" tag after severities', () => {
        const a = agg({ unusedCount: 12 });
        assert.strictEqual(buildCategoryDescription(59, a), '59 · 12 unused');
    });

    test('order: count · severities · unused', () => {
        const a = agg({
            counts: { error: 1, warning: 0, info: 0, hint: 0 },
            unusedCount: 3,
        });
        const out = buildCategoryDescription(7, a);
        assert.ok(out.indexOf('7') < out.indexOf('1E'));
        assert.ok(out.indexOf('1E') < out.indexOf('3 unused'));
    });

    test('omits zero severities individually', () => {
        const a = agg({ counts: { error: 2, warning: 0, info: 0, hint: 3 } });
        // No 0W, no 0I — only E and H.
        assert.strictEqual(buildCategoryDescription(10, a), '10 · 2E 3H');
    });

    test('renders info count with I suffix', () => {
        const a = agg({ counts: { error: 0, warning: 0, info: 5, hint: 0 } });
        assert.strictEqual(buildCategoryDescription(10, a), '10 · 5I');
    });

    test('singular vs plural is not differentiated (rendering convention)', () => {
        // Keeping the format predictable: '1 unused' even when count is 1.
        const a = agg({ unusedCount: 1 });
        assert.strictEqual(buildCategoryDescription(10, a), '10 · 1 unused');
    });
});

// ── Surgical refresh ─────────────────────────────────────────────────────
//
// onDidChangeDiagnostics fires on every diagnostic update — which means
// every keystroke (after debounce) in any open document. Refreshing the
// whole tree every time was the symptom the user complained about. These
// tests lock in the new contract: refreshForUris only re-emits the items
// whose displayed state depends on the changed URIs.

suite('ComponentTreeProvider: refreshForUris', () => {

    test('non-component URIs produce zero re-emits', async function () {
        this.timeout(15000);
        const provider = new ComponentTreeProvider();
        // Build the tree once so internal caches are populated.
        const roots = provider.getChildren();
        for (const r of roots) { provider.getChildren(r); }

        let fired = 0;
        provider.onDidChangeTreeData(() => { fired++; });

        // A diagnostic change on a random non-component file.
        provider.refreshForUris([vscode.Uri.file('/tmp/some-random-page.html')]);
        assert.strictEqual(fired, 0, 'non-component URIs must not refresh anything');
    });

    test('a component URI fires exactly one item + one category event', async function () {
        this.timeout(15000);
        const provider = new ComponentTreeProvider();
        // Build the tree by walking from root → categories → components so the
        // internal caches populate.
        const roots = provider.getChildren();
        assert.ok(roots.length > 0, 'Test workspace must have at least one category');
        const children = provider.getChildren(roots[0]);
        assert.ok(children.length > 0, 'Test workspace must have at least one component');

        // Pull the component's underlying file URI off its tree item.
        const fileUri = children[0].resourceUri?.with({ scheme: 'file' });
        assert.ok(fileUri, 'ComponentItem must have a resourceUri');

        let fired = 0;
        provider.onDidChangeTreeData(() => { fired++; });

        provider.refreshForUris([fileUri!]);
        // Exactly two emits: one for the ComponentItem, one for its CategoryItem.
        assert.strictEqual(fired, 2, `Expected 2 surgical fires, got ${fired}`);
    });

    test('refresh() (full rebuild) fires once with undefined', async function () {
        this.timeout(15000);
        const provider = new ComponentTreeProvider();
        provider.getChildren();

        let fired = 0;
        let lastArg: unknown = 'unset';
        provider.onDidChangeTreeData(e => { fired++; lastArg = e; });

        provider.refresh();
        assert.strictEqual(fired, 1);
        assert.strictEqual(lastArg, undefined);
    });
});

suite('CottonTreeDecorationProvider: refreshUris', () => {

    test('maps file:// URIs to cotton-tree:// before firing', async () => {
        const provider = new CottonTreeDecorationProvider();
        const events: (vscode.Uri | vscode.Uri[] | undefined)[] = [];
        provider.onDidChangeFileDecorations(e => { events.push(e); });

        provider.refreshUris([vscode.Uri.file('/foo/bar.html')]);
        assert.strictEqual(events.length, 1);
        const fired = events[0] as vscode.Uri[];
        assert.ok(Array.isArray(fired));
        assert.strictEqual(fired[0].scheme, 'cotton-tree', `Expected scheme rewrite, got ${fired[0].scheme}`);
        assert.strictEqual(fired[0].fsPath, '/foo/bar.html');
    });

    test('skips non-file URIs (they would not have a cotton-tree twin)', () => {
        const provider = new CottonTreeDecorationProvider();
        let fired = 0;
        provider.onDidChangeFileDecorations(() => { fired++; });

        provider.refreshUris([vscode.Uri.parse('untitled:/some-file')]);
        assert.strictEqual(fired, 0);
    });
});
