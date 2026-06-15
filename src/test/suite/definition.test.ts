import * as assert from 'assert';
import * as vscode from 'vscode';
import { DefinitionProvider } from '../../core/providers/definition';

/**
 * DefinitionProvider works entirely off the in-memory document text (direct
 * `<c-tag>` under the cursor, or a literal `<c-component is="target">`), so it
 * tests cleanly against untitled docs — no disk fixtures needed. scanComponents
 * self-populates from the workspace, so findComponentFile resolves real tags.
 */
suite('DefinitionProvider', () => {

    const provider = new DefinitionProvider();

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    async function defineAt(content: string, char: number) {
        const doc = await vscode.workspace.openTextDocument({ content, language: 'html' });
        return provider.provideDefinition(doc, new vscode.Position(0, char));
    }

    suite('direct <c-tag> reference', () => {

        test('jumps to the component file for a tag under the cursor', async () => {
            const links = await defineAt('<c-atoms.button />', 8); // cursor inside "atoms.button"
            assert.ok(links && links.length === 1, 'expected one definition link');
            assert.ok(links![0].targetUri.fsPath.replace(/\\/g, '/').endsWith('atoms/button.html'),
                `expected to jump to atoms/button.html, got ${links![0].targetUri.fsPath}`);
        });

        test('the origin selection range covers the tag name', async () => {
            const links = await defineAt('<c-atoms.button />', 8);
            const origin = links![0].originSelectionRange!;
            const text = '<c-atoms.button />'.substring(origin.start.character, origin.end.character);
            assert.strictEqual(text, 'atoms.button');
        });

        test('returns undefined when the cursor is NOT on the tag', async () => {
            // Leading spaces push the tag to index 3; cursor at 0 is off the tag.
            const links = await defineAt('   <c-atoms.button />', 0);
            assert.strictEqual(links, undefined);
        });

        test('returns undefined for an unknown component', async () => {
            const links = await defineAt('<c-nope.missing />', 8);
            assert.strictEqual(links, undefined);
        });
    });

    suite('<c-component is="..."> dispatch reference', () => {

        test('jumps to the target for a literal is="atoms.button"', async () => {
            const content = '<c-component is="atoms.button" />';
            const char = content.indexOf('atoms.button') + 2; // cursor inside the value
            const links = await defineAt(content, char);
            assert.ok(links && links.length === 1, 'expected one definition link for literal is=');
            assert.ok(links![0].targetUri.fsPath.replace(/\\/g, '/').endsWith('atoms/button.html'));
        });

        test('does NOT resolve a :is="..." expression', async () => {
            const content = '<c-component :is="some_var" />';
            const char = content.indexOf('some_var') + 2;
            const links = await defineAt(content, char);
            assert.strictEqual(links, undefined);
        });

        test('does NOT resolve an interpolated is="prefix.{{ x }}"', async () => {
            const content = '<c-component is="atoms.{{ name }}" />';
            const char = content.indexOf('atoms.') + 2;
            const links = await defineAt(content, char);
            assert.strictEqual(links, undefined);
        });

        test('returns undefined for a literal is= pointing at an unknown tag', async () => {
            const content = '<c-component is="nope.missing" />';
            const char = content.indexOf('nope.missing') + 2;
            const links = await defineAt(content, char);
            assert.strictEqual(links, undefined);
        });
    });

    test('returns undefined on plain text with no cotton tag', async () => {
        const links = await defineAt('<div>just html</div>', 6);
        assert.strictEqual(links, undefined);
    });
});
