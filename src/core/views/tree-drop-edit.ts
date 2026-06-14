import * as vscode from 'vscode';
import { findComponentFile, getCachedProps } from '../scanner';
import { buildUsageSnippet } from '../snippet-builder';

/** MIME type used to ferry dragged component tags from the tree view to
 *  the DocumentDropEditProvider that turns them into editor snippets. */
export const COTTON_DRAG_MIME = 'application/vnd.cotton.component';

/** Handles drops from component tree into the editor */
export class CottonDropEditProvider implements vscode.DocumentDropEditProvider {
    async provideDocumentDropEdits(
        _document: vscode.TextDocument,
        _position: vscode.Position,
        dataTransfer: vscode.DataTransfer,
    ): Promise<vscode.DocumentDropEdit | undefined> {
        const item = dataTransfer.get(COTTON_DRAG_MIME);
        if (!item) { return undefined; }

        let parsed: unknown;
        try {
            parsed = JSON.parse(await item.asString());
        } catch {
            return undefined;
        }
        if (!isTagArray(parsed)) { return undefined; }

        const snippet = new vscode.SnippetString(parsed.map(buildSnippetFor).join('\n'));
        return new vscode.DocumentDropEdit(snippet);
    }
}

const TAG_NAME_RE = /^[\w.-]+$/;
export function isTagArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(v => typeof v === 'string' && TAG_NAME_RE.test(v));
}

/** Compose the SnippetString body for a single dropped tag. Falls back to
 *  the bare `<c-tag>$0</c-tag>` shape if the component file can't be located
 *  (e.g. dropped from an orphaned tree entry between rescans). */
function buildSnippetFor(tag: string): string {
    const filePath = findComponentFile(tag);
    if (!filePath) { return `<c-${tag}>$0</c-${tag}>`; }
    return buildUsageSnippet(tag, getCachedProps(filePath));
}
