import * as vscode from 'vscode';
import * as path from 'path';
import { getTemplatePaths, invalidateScanCache } from '../scanner';

const SIMPLE_VAR_RE = /\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g;
const COMPLEX_VAR_RE = /\{\{\s*([^}]+?)\s*\}\}/g;
const SIMPLE_IDENT_RE = /^[a-zA-Z_][\w]*$/;
const VALID_NAME_RE = /^[a-z][a-z0-9-]*$/;

export async function extractComponent() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showInformationMessage('Select HTML to extract first');
        return;
    }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const selectedText = editor.document.getText(selection);

    const subfolder = await vscode.window.showQuickPick(
        ['atoms', 'molecules', 'organisms', 'layouts'],
        { placeHolder: 'Select destination folder' },
    );
    if (!subfolder) { return; }

    const name = await vscode.window.showInputBox({
        prompt: 'Component name (kebab-case)',
        validateInput: (v) => {
            if (!v) { return 'Name is required'; }
            if (!VALID_NAME_RE.test(v)) { return 'Use lowercase letters, numbers and hyphens'; }
            return null;
        },
    });
    if (!name) { return; }

    const tplPath = getTemplatePaths()[0] ?? 'templates/cotton';
    const workspaceRoot = folder.uri.fsPath;
    const targetDir = path.resolve(workspaceRoot, tplPath, subfolder);
    const targetPath = path.resolve(targetDir, `${name}.html`);

    if (!isInside(workspaceRoot, targetPath)) {
        vscode.window.showErrorMessage(
            `Refused to write outside workspace root (check djangoCottonProps.templatePaths setting).`,
        );
        return;
    }

    const targetUri = vscode.Uri.file(targetPath);
    if (await fileExists(targetUri)) {
        const overwrite = await vscode.window.showWarningMessage(
            `${subfolder}/${name}.html already exists. Overwrite?`,
            { modal: true },
            'Overwrite',
        );
        if (overwrite !== 'Overwrite') { return; }
    }

    const vars = detectSimpleVars(selectedText);
    const componentContent = buildComponentFile(selectedText, vars);
    const usage = buildUsageTag(subfolder, name, vars);

    try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(targetDir));
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to create target directory: ${err instanceof Error ? err.message : String(err)}`);
        return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.createFile(targetUri, {
        overwrite: true,
        ignoreIfExists: false,
        contents: Buffer.from(componentContent, 'utf8'),
    });
    edit.replace(editor.document.uri, selection, usage);

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
        vscode.window.showErrorMessage('Failed to apply extract-component edit');
        return;
    }

    invalidateScanCache();

    await vscode.window.showTextDocument(targetUri, { preview: false });

    const skipped = detectSkippedExpressions(selectedText);
    if (skipped.length > 0) {
        vscode.window.showWarningMessage(
            `Extracted with ${vars.length} prop${vars.length === 1 ? '' : 's'}. ` +
            `${skipped.length} complex expression${skipped.length === 1 ? '' : 's'} left as-is — review manually.`,
        );
    } else {
        vscode.window.showInformationMessage(`Extracted to ${subfolder}/${name}.html`);
    }
}

export function isInside(root: string, target: string): boolean {
    const rel = path.relative(path.resolve(root), path.resolve(target));
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

export function detectSimpleVars(html: string): string[] {
    const found = new Set<string>();
    for (const match of html.matchAll(SIMPLE_VAR_RE)) {
        found.add(match[1]);
    }
    return Array.from(found);
}

export function detectSkippedExpressions(html: string): string[] {
    const simple = new Set(detectSimpleVars(html));
    const skipped: string[] = [];
    for (const match of html.matchAll(COMPLEX_VAR_RE)) {
        const expr = match[1];
        if (!SIMPLE_IDENT_RE.test(expr) || !simple.has(expr)) {
            skipped.push(expr);
        }
    }
    return skipped;
}

export function buildComponentFile(body: string, vars: string[]): string {
    const lines: string[] = [];
    for (const v of vars) {
        lines.push(`{# @prop ${v}:text | description:"${v}" #}`);
    }
    if (vars.length > 0) {
        lines.push('');
        lines.push(`<c-vars ${vars.map(v => `${v}=""`).join(' ')} />`);
        lines.push('');
    }
    lines.push(body.trimEnd());
    lines.push('');
    return lines.join('\n');
}

export function buildUsageTag(subfolder: string, name: string, vars: string[]): string {
    if (vars.length === 0) {
        return `<c-${subfolder}.${name} />`;
    }
    const attrs = vars.map(v => `${v}="{{ ${v} }}"`).join(' ');
    return `<c-${subfolder}.${name} ${attrs} />`;
}
