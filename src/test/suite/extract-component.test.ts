import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    detectSimpleVars,
    detectSkippedExpressions,
    buildComponentFile,
    buildUsageTag,
    isInside,
    extractComponent,
} from '../../core/commands/extract-component';

suite('extractComponent helpers', () => {

    suite('detectSimpleVars', () => {
        test('extracts single variable', () => {
            assert.deepStrictEqual(detectSimpleVars('<span>{{ label }}</span>'), ['label']);
        });

        test('extracts multiple distinct variables', () => {
            const vars = detectSimpleVars('<button class="{{ variant }}">{{ label }}</button>');
            assert.deepStrictEqual(vars.sort(), ['label', 'variant']);
        });

        test('deduplicates repeated variables', () => {
            assert.deepStrictEqual(detectSimpleVars('{{ foo }}{{ foo }}'), ['foo']);
        });

        test('ignores complex expressions with filters', () => {
            assert.deepStrictEqual(detectSimpleVars('{{ foo|upper }}'), []);
        });

        test('ignores dotted paths', () => {
            assert.deepStrictEqual(detectSimpleVars('{{ user.name }}'), []);
        });

        test('returns empty for plain HTML', () => {
            assert.deepStrictEqual(detectSimpleVars('<div>no vars</div>'), []);
        });
    });

    suite('detectSkippedExpressions', () => {
        test('flags filtered expressions', () => {
            const skipped = detectSkippedExpressions('{{ foo|upper }}');
            assert.strictEqual(skipped.length, 1);
            assert.strictEqual(skipped[0], 'foo|upper');
        });

        test('flags dotted paths', () => {
            const skipped = detectSkippedExpressions('{{ user.name }}');
            assert.strictEqual(skipped.length, 1);
        });

        test('returns empty when only simple vars', () => {
            assert.strictEqual(detectSkippedExpressions('{{ foo }} {{ bar }}').length, 0);
        });
    });

    suite('buildComponentFile', () => {
        test('emits @prop annotations and c-vars for each var', () => {
            const out = buildComponentFile('<span>{{ label }}</span>', ['label']);
            assert.ok(out.includes('{# @prop label:text'));
            assert.ok(out.includes('<c-vars label=""'));
            assert.ok(out.includes('<span>{{ label }}</span>'));
        });

        test('no c-vars when no props', () => {
            const out = buildComponentFile('<div>plain</div>', []);
            assert.ok(!out.includes('<c-vars'));
            assert.ok(out.includes('<div>plain</div>'));
        });

        test('multiple vars produce multiple annotations', () => {
            const out = buildComponentFile('{{ a }}{{ b }}', ['a', 'b']);
            const annotationCount = (out.match(/@prop/g) || []).length;
            assert.strictEqual(annotationCount, 2);
        });
    });

    suite('buildUsageTag', () => {
        test('self-closing tag when no vars', () => {
            assert.strictEqual(buildUsageTag('atoms', 'my-button', []), '<c-atoms.my-button />');
        });

        test('passes vars as Django template interpolations', () => {
            const usage = buildUsageTag('atoms', 'my-button', ['variant', 'label']);
            assert.ok(usage.includes('variant="{{ variant }}"'));
            assert.ok(usage.includes('label="{{ label }}"'));
            assert.ok(usage.startsWith('<c-atoms.my-button '));
            assert.ok(usage.endsWith('/>'));
        });
    });

    suite('isInside (path traversal guard)', () => {
        const root = path.resolve('/workspace/project');

        test('accepts direct child', () => {
            assert.strictEqual(isInside(root, path.resolve(root, 'templates/cotton/atoms/x.html')), true);
        });

        test('rejects parent directory escape via ..', () => {
            assert.strictEqual(isInside(root, path.resolve(root, '../other/file.html')), false);
        });

        test('rejects deep parent escape via multiple ..', () => {
            assert.strictEqual(isInside(root, path.resolve(root, '../../etc/passwd')), false);
        });

        test('rejects absolute path outside root', () => {
            assert.strictEqual(isInside(root, '/etc/passwd'), false);
        });

        test('rejects exact root (no filename)', () => {
            assert.strictEqual(isInside(root, root), false);
        });

        test('normalizes embedded .. segments', () => {
            assert.strictEqual(isInside(root, path.join(root, 'templates/../../../secret')), false);
        });

        test('accepts deeply nested valid path', () => {
            assert.strictEqual(isInside(root, path.resolve(root, 'a/b/c/d/e.html')), true);
        });
    });
});

// ── Orchestrator (drives the full command, stubbing the VS Code UI) ──
//
// Mirrors the wrap-selection.test.ts approach: monkeypatch window prompts,
// capture the toasts, and assert on the resulting document + files. The pure
// helpers above are unit-tested; this exercises the glue that wires them to
// the editor, the path-traversal guard, and the disk writes.

suite('extractComponent (orchestrator)', () => {
     
    const restores: Array<() => void> = [];
    let info: string[];
    let warn: string[];
    let error: string[];
    let filesToClean: vscode.Uri[];

     
    function override(obj: any, key: string, value: any): void {
        const original = obj[key];
        restores.push(() => { obj[key] = original; });
        obj[key] = value;
    }

    function stubQuickPick(ret: string | undefined): void {
        override(vscode.window, 'showQuickPick', async () => ret);
    }

    function stubInputBox(ret: string | undefined): void {
        override(vscode.window, 'showInputBox', async () => ret);
    }

    function workspaceRoot(): string {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder, 'these tests require an open workspace folder');
        return folder.uri.fsPath;
    }

    function componentUri(subfolder: string, name: string): vscode.Uri {
        return vscode.Uri.file(path.resolve(workspaceRoot(), 'templates/cotton', subfolder, `${name}.html`));
    }

    async function openWithSelection(content: string, empty = false): Promise<vscode.TextEditor> {
        const doc = await vscode.workspace.openTextDocument({ content, language: 'html' });
        const editor = await vscode.window.showTextDocument(doc);
        editor.selection = empty
            ? new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))
            : new vscode.Selection(new vscode.Position(0, 0), doc.lineAt(doc.lineCount - 1).range.end);
        return editor;
    }

    setup(() => {
        restores.length = 0;
        info = [];
        warn = [];
        error = [];
        filesToClean = [];
        override(vscode.window, 'showInformationMessage', async (m: string) => { info.push(m); return undefined; });
        override(vscode.window, 'showWarningMessage', async (m: string) => { warn.push(m); return undefined; });
        override(vscode.window, 'showErrorMessage', async (m: string) => { error.push(m); return undefined; });
    });

    teardown(async () => {
        while (restores.length) {
            const restore = restores.pop();
            if (restore) { restore(); }
        }
        for (const uri of filesToClean) {
            try {
                await vscode.workspace.fs.delete(uri);
            } catch {
                /* already gone — fine */
            }
        }
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('errors when there is no active editor', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        await extractComponent();

        assert.ok(error.some(m => /no active editor/i.test(m)), `expected a "no active editor" error, got ${JSON.stringify(error)}`);
    });

    test('informs and aborts when the selection is empty', async function () {
        this.timeout(10000);
        await openWithSelection('<span>{{ label }}</span>', true);

        await extractComponent();

        assert.ok(info.some(m => /select html/i.test(m)), `expected a "select HTML first" info, got ${JSON.stringify(info)}`);
    });

    test('aborts cleanly when the destination quick pick is dismissed', async function () {
        this.timeout(10000);
        stubQuickPick(undefined);
        const editor = await openWithSelection('<span>{{ label }}</span>');
        const before = editor.document.getText();

        await extractComponent();

        assert.strictEqual(editor.document.getText(), before, 'cancelling the quick pick must leave the document untouched');
    });

    test('aborts cleanly when the name input is dismissed', async function () {
        this.timeout(10000);
        stubQuickPick('atoms');
        stubInputBox(undefined);
        const editor = await openWithSelection('<span>{{ label }}</span>');
        const before = editor.document.getText();

        await extractComponent();

        assert.strictEqual(editor.document.getText(), before, 'cancelling the name input must leave the document untouched');
    });

    test('refuses to write outside the workspace root (path-traversal guard)', async function () {
        this.timeout(10000);
        stubQuickPick('atoms');
        stubInputBox('escape-test');
        // Force templatePaths to escape the workspace; the orchestrator's guard must refuse.
        const realGetConfig = vscode.workspace.getConfiguration.bind(vscode.workspace);
         
        override(vscode.workspace, 'getConfiguration', (section?: string, scope?: any) => {
             
            const cfg: any = realGetConfig(section as never, scope);
            if (section === 'djangoCottonProps') {
                const realGet = cfg.get.bind(cfg);
                return {
                    ...cfg,
                     
                    get: (key: string, def: any) => (key === 'templatePaths' ? ['../../escape'] : realGet(key, def)),
                };
            }
            return cfg;
        });
        const editor = await openWithSelection('<span>{{ label }}</span>');
        const before = editor.document.getText();

        await extractComponent();

        assert.ok(error.some(m => /outside workspace root/i.test(m)), `expected a path-traversal refusal, got ${JSON.stringify(error)}`);
        assert.strictEqual(editor.document.getText(), before, 'a refused extract must not touch the document');
    });

    test('extracts a simple-var selection: creates the component file and rewrites the selection', async function () {
        this.timeout(15000);
        stubQuickPick('atoms');
        stubInputBox('orch-simple');
        const target = componentUri('atoms', 'orch-simple');
        filesToClean.push(target);

        const editor = await openWithSelection('<span>{{ label }}</span>');
        await extractComponent();

        // 1. The component file exists with the @prop annotation + c-vars.
        const created = Buffer.from(await vscode.workspace.fs.readFile(target)).toString('utf8');
        assert.ok(created.includes('{# @prop label:text'), `component file must declare the prop, got:\n${created}`);
        assert.ok(created.includes('<c-vars label=""'), `component file must declare c-vars, got:\n${created}`);
        assert.ok(created.includes('<span>{{ label }}</span>'), 'component file must keep the original body');

        // 2. The selection was replaced with the usage tag.
        const rewritten = editor.document.getText();
        assert.ok(
            rewritten.includes('<c-atoms.orch-simple label="{{ label }}" />'),
            `selection must become the usage tag, got:\n${rewritten}`,
        );

        // 3. A success message was shown.
        assert.ok(info.some(m => /extracted to atoms\/orch-simple/i.test(m)), `expected success info, got ${JSON.stringify(info)}`);
    });

    test('warns when the selection holds complex expressions left as-is', async function () {
        this.timeout(15000);
        stubQuickPick('atoms');
        stubInputBox('orch-complex');
        filesToClean.push(componentUri('atoms', 'orch-complex'));

        await openWithSelection('<span>{{ user.name|upper }}</span>');
        await extractComponent();

        assert.ok(warn.some(m => /complex expression/i.test(m)), `expected a complex-expression warning, got ${JSON.stringify(warn)}`);
    });

    test('aborts when an existing file is not confirmed for overwrite', async function () {
        this.timeout(15000);
        stubQuickPick('atoms');
        stubInputBox('orch-overwrite');
        const target = componentUri('atoms', 'orch-overwrite');
        filesToClean.push(target);
        // Pre-create the file so the command hits the overwrite prompt; the stubbed
        // showWarningMessage returns undefined => the user declined the overwrite.
        await vscode.workspace.fs.writeFile(target, Buffer.from('PRE-EXISTING', 'utf8'));

        const editor = await openWithSelection('<span>{{ label }}</span>');
        const before = editor.document.getText();
        await extractComponent();

        assert.strictEqual(editor.document.getText(), before, 'declining overwrite must leave the document untouched');
        const onDisk = Buffer.from(await vscode.workspace.fs.readFile(target)).toString('utf8');
        assert.strictEqual(onDisk, 'PRE-EXISTING', 'declining overwrite must not modify the existing file');
    });
});
