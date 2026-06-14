import * as assert from 'assert';
import * as vscode from 'vscode';
import { CottonReferenceProvider } from '../../core/providers/references';
import { UsageIndex } from '../../core/usage-index';

/**
 * CottonReferenceProvider finds where a component is USED. It detects the tag
 * under the cursor, then re-reads the files the UsageIndex recorded for that
 * tag (from disk) to collect exact occurrence locations. We drive it against
 * the real workspace fixtures (pages/valid-usage.html uses atoms.badge).
 *
 * NOTE: the `<c-component is="literal">` dispatch branch of findUsages re-reads
 * files from disk, so a provider-level test would need a fixture containing a
 * LITERAL is="tag" (none exist in the workspace, and adding one would perturb
 * other suites' usage counts). That branch is exercised at the index level by
 * usage-index.test.ts ("c-component is=... counts as direct use").
 */
suite('CottonReferenceProvider', () => {

    let index: UsageIndex;
    let provider: CottonReferenceProvider;

    suiteSetup(async () => {
        index = new UsageIndex();
        await index.ready;
        provider = new CottonReferenceProvider(index);
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    async function referencesAt(content: string, char: number): Promise<vscode.Location[]> {
        const doc = await vscode.workspace.openTextDocument({ content, language: 'html' });
        return provider.provideReferences(doc, new vscode.Position(0, char));
    }

    test('finds usages of a tag under the cursor', async function () {
        this.timeout(10000);
        const locations = await referencesAt('<c-atoms.badge />', 8); // cursor inside "atoms.badge"
        assert.ok(locations.length > 0, 'expected at least one usage location for atoms.badge');
        const paths = locations.map(l => l.uri.fsPath.replace(/\\/g, '/'));
        assert.ok(paths.some(p => p.endsWith('pages/valid-usage.html')),
            `expected a reference in valid-usage.html, got: ${paths.join(', ')}`);
    });

    test('every returned location points at a real file with a position', async function () {
        this.timeout(10000);
        const locations = await referencesAt('<c-atoms.badge />', 8);
        for (const loc of locations) {
            assert.ok(loc.uri.scheme === 'file', 'location should be a file URI');
            assert.ok(loc.range.start.line >= 0 && loc.range.start.character >= 0, 'location needs a valid position');
        }
    });

    test('returns an empty list when the cursor is not on a cotton tag', async () => {
        const locations = await referencesAt('<div>plain html</div>', 6);
        assert.deepStrictEqual(locations, []);
    });

    test('returns an empty list for a tag that is never used', async function () {
        this.timeout(10000);
        const locations = await referencesAt('<c-atoms.totally-unused-xyz />', 8);
        assert.deepStrictEqual(locations, []);
    });
});
