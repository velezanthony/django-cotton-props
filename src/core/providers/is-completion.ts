import * as vscode from 'vscode';
import { EXTENSION_NAME } from '../constants';
import { scanComponents, getCachedProps } from '../scanner';
import { formatPropSummary } from '../formatting';

/**
 * Suggests component tag names inside `<c-component is="...">`.
 *
 * Only the static-string form `is="..."` is supported — `:is="..."` takes a
 * Django expression where literal completion would be misleading. We also
 * stop suggesting once the user types a `{{`/`{%` interpolation, since the
 * remainder is not a literal target.
 */
export class IsValueCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
        const ctx = findIsValueContext(document, position);
        if (!ctx) { return undefined; }

        const replaceRange = new vscode.Range(
            position.translate(0, -ctx.partial.length),
            position,
        );

        const items: vscode.CompletionItem[] = [];
        for (const c of scanComponents()) {
            if (ctx.partial && !c.tag.toLowerCase().startsWith(ctx.partial.toLowerCase())) { continue; }
            const item = new vscode.CompletionItem(
                { label: c.tag, description: `${EXTENSION_NAME} (is target)` },
                vscode.CompletionItemKind.Module,
            );
            item.insertText = c.tag;
            item.range = replaceRange;
            item.filterText = c.tag;
            item.sortText = `0_${c.tag}`;

            const props = getCachedProps(c.filePath);
            if (props.length) {
                const sections = props.map(p => formatPropSummary(p));
                item.documentation = new vscode.MarkdownString(`**c-${c.tag}**\n\n${sections.join('\n\n')}`);
            }
            items.push(item);
        }
        return items;
    }
}

interface IsValueContext {
    /** What the user has typed inside the quotes, up to the cursor. */
    partial: string;
}

const OPEN_RE = /<c-component\b/g;

export function findIsValueContext(
    document: vscode.TextDocument,
    position: vscode.Position,
): IsValueContext | undefined {
    const line = document.lineAt(position.line).text;
    const prefix = line.substring(0, position.character);

    // We need to be inside an open `<c-component` tag — find the most recent open
    // on this line and verify the cursor is inside it (no `>` after).
    let lastOpen = -1;
    for (const m of prefix.matchAll(OPEN_RE)) {
        lastOpen = m.index!;
    }
    if (lastOpen === -1) { return undefined; }
    const afterOpen = prefix.substring(lastOpen);
    if (afterOpen.includes('>')) { return undefined; }

    // We must be inside an `is="..."` value (not `:is="..."`).
    // Find the matching `is="` that's open at the cursor.
    const isMatch = /(^|\s)is=(["'])([^"']*)$/.exec(afterOpen);
    if (!isMatch) { return undefined; }
    const valueSoFar = isMatch[3];

    // If the user has already typed `{{` or `{%`, we're past the literal head.
    if (/\{\{|\{%/.test(valueSoFar)) { return undefined; }

    return { partial: valueSoFar };
}
