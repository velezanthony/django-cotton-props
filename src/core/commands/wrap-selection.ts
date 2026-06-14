import * as vscode from 'vscode';
import { scanComponents, getCachedProps, findComponentFile } from '../scanner';
import { formatPropSummary } from '../formatting';
import { buildUsageOpenTag } from '../snippet-builder';

export async function wrapWithComponent() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showInformationMessage('Select some HTML first');
        return;
    }

    const components = scanComponents();
    const items: vscode.QuickPickItem[] = components.map(c => {
        const props = getCachedProps(c.filePath);
        return {
            label: `c-${c.tag}`,
            description: props.length ? `${props.length} props` : '',
            detail: props.filter(p => !p.hidden).map(p => formatPropSummary(p)).join('  ·  '),
        };
    });

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a component to wrap with',
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!picked) { return; }

    const tag = picked.label.substring(2);
    const filePath = findComponentFile(tag);
    const props = filePath ? getCachedProps(filePath) : [];

    const selectedText = editor.document.getText(selection);

    // Detect indentation of the selection's first line.
    const startLine = editor.document.lineAt(selection.start.line);
    const indent = startLine.text.match(/^(\s*)/)?.[1] ?? '';
    const innerIndent = indent + '    ';

    const openTagTemplate = buildUsageOpenTag(tag, props, { indent: innerIndent });
    // Re-indent the open tag so prop lines and the closing > sit at `indent`.
    const open = openTagTemplate.replace(/\n/g, `\n${indent}`);

    const indentedContent = selectedText
        .split('\n')
        .map(line => line.trim() ? `${innerIndent}${line.trimStart()}` : line)
        .join('\n');

    const wrapped = `${indent}${open}\n${indentedContent}\n${indent}</c-${tag}>`;

    // Use a SnippetString so tabstops are interactive after the wrap.
    await editor.insertSnippet(new vscode.SnippetString(wrapped), selection);
}
