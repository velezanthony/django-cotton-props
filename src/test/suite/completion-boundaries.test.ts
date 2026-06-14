import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Regression: completion providers must respect attribute-value boundaries.
// Inside `<c-tag prop="|"` only VALUE completions belong — never the prop list
// (which nested `attr="..."` snippets) nor the tag list (which nested `<c-tag`).

function fixturePath(rel: string): string {
    return path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, rel);
}

function label(item: vscode.CompletionItem): string {
    return typeof item.label === 'string' ? item.label : item.label.label;
}

let caseCounter = 0;

// The cursor is always at the END of `content` (supports multi-line content).
async function completionsAt(content: string, trigger: string): Promise<vscode.CompletionItem[]> {
    // Unique file per case: VS Code caches TextDocument by URI, so reusing one
    // path serves a stale buffer across cases (the known cached-buffer race).
    const fp = fixturePath(`pages/completion-boundary-${caseCounter++}.html`);
    fs.writeFileSync(fp, content, 'utf-8');
    try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fp));
        await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 400));
        const lines = content.split('\n');
        const pos = new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            pos,
            trigger,
        ) ?? { items: [], isIncomplete: false };
        return result.items;
    } finally {
        fs.unlinkSync(fp);
    }
}

function snippetLeaks(items: vscode.CompletionItem[], pattern: RegExp): string[] {
    return items
        .filter(i => i.insertText instanceof vscode.SnippetString && pattern.test(i.insertText.value))
        .map(i => (i.insertText as vscode.SnippetString).value);
}

suite('Completion boundaries: attribute value', () => {
    test('inside a prop value: only value options, no prop snippets', async function () {
        this.timeout(20000);
        const items = await completionsAt('<c-atoms.button size="', '"');

        // The 3 select options must be present.
        const labels = items.map(label);
        for (const opt of ['sm', 'md', 'lg']) {
            assert.ok(labels.includes(opt), `expected value option '${opt}', got: ${labels.join(', ')}`);
        }

        // No prop-list item may leak in — those are the ones that produced the
        // `<c-atoms.button loading="` nesting in the bug report.
        const leaks = snippetLeaks(items, /^:?[\w-]+="/);
        assert.strictEqual(leaks.length, 0, `prop snippets leaked into value: ${leaks.join(' | ')}`);
    });

    test('guard holds with single quotes', async function () {
        this.timeout(20000);
        const items = await completionsAt("<c-atoms.button size='", "'");
        const leaks = snippetLeaks(items, /^:?[\w-]+=["']/);
        assert.strictEqual(leaks.length, 0, `prop snippets leaked into single-quoted value: ${leaks.join(' | ')}`);
    });

    test('guard holds across a multi-line tag', async function () {
        this.timeout(20000);
        const items = await completionsAt('<c-atoms.button\n  size="', '"');
        const leaks = snippetLeaks(items, /^:?[\w-]+="/);
        assert.strictEqual(leaks.length, 0, `prop snippets leaked into multi-line value: ${leaks.join(' | ')}`);
    });

    test('typing `<c` inside a prop value does not open the tag list', async function () {
        this.timeout(20000);
        const items = await completionsAt('<c-atoms.button size="<c', '<');
        const leaks = snippetLeaks(items, /<c-/);
        assert.strictEqual(leaks.length, 0, `tag snippets leaked into value: ${leaks.join(' | ')}`);
    });

    test('after a closed value, prop completion still works', async function () {
        this.timeout(20000);
        const items = await completionsAt('<c-atoms.button size="md" ', ' ');
        const labels = items.map(label);
        assert.ok(labels.includes('loading'),
            `expected prop completion in attr-name position, got: ${labels.join(', ')}`);
    });
});
