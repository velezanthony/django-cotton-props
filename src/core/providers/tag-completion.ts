import * as vscode from 'vscode';
import { BUILTIN_COMPLETIONS, EXTENSION_NAME } from '../constants';
import { scanComponents, getCachedProps } from '../scanner';
import { formatPropSummary } from '../formatting';
import { isInsideAttributeValue } from '../helpers';

type Mode = 'create' | 'rename';

/** Find the matching closing tag at depth 0, regardless of its name */
function findClosingTagOffsets(text: string, afterOpenTag: number): { start: number; end: number } | undefined {
    let depth = 0;
    const re = /<(\/?)c-([\w.-]+)/g;
    re.lastIndex = afterOpenTag;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m[1] === '/') {
            if (depth === 0) {
                const tagEnd = text.indexOf('>', m.index);
                if (tagEnd === -1) { return undefined; }
                return { start: m.index, end: tagEnd + 1 };
            }
            depth--;
        } else {
            const tagEnd = text.indexOf('>', m.index);
            if (tagEnd !== -1 && text[tagEnd - 1] === '/') { continue; }
            depth++;
        }
    }
    return undefined;
}

export class TagCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
        try {
            const linePrefix = document.lineAt(position).text.substring(0, position.character);

            // A literal `<c` typed inside an open `attr="..."` value must not open
            // the tag list — that nests `<c-tag` snippets inside the quote.
            // `is="..."` targets are served by IsValueCompletionProvider instead.
            if (isInsideAttributeValue(linePrefix)) { return undefined; }

            const angleMatch = linePrefix.match(/<(c[-\w.]*)$/);
            const bareMatch = linePrefix.match(/(?:^|[\s])c([-\w.]*)$/);
            if (!angleMatch && !bareMatch) { return undefined; }

            const isAngle = !!angleMatch;
            const typed = isAngle ? angleMatch[1] : 'c' + (bareMatch![1] || '');
            const fullMatch = isAngle ? '<' + angleMatch[1] : typed;

            // Don't match inside another tag's attributes
            if (!isAngle) {
                const lastOpen = linePrefix.lastIndexOf('<');
                const lastClose = linePrefix.lastIndexOf('>');
                if (lastOpen > lastClose) { return undefined; }
            }

            const dashIdx = typed.indexOf('-');
            const partial = dashIdx >= 0 ? typed.substring(dashIdx + 1).toLowerCase() : '';
            const prefix = isAngle ? '<c-' : 'c-';

            // Consume any remaining word chars after cursor (mid-word completion)
            const lineAfter = document.lineAt(position).text.substring(position.character);
            const rightMatch = lineAfter.match(/^[\w.-]*/);
            const rightExtra = rightMatch ? rightMatch[0].length : 0;

            // Detect mode: is there a > after the remaining tag chars? → rename
            const afterTag = lineAfter.substring(rightExtra);
            const mode: Mode = /^\s*>/.test(afterTag) ? 'rename' : 'create';

            const replaceStart = new vscode.Position(position.line, position.character - fullMatch.length);
            const replaceEnd = new vscode.Position(position.line, position.character + rightExtra);
            const replaceRange = new vscode.Range(replaceStart, replaceEnd);

            // In rename mode: find the ACTUAL closing tag by depth-matching
            let closingRange: vscode.Range | undefined;
            if (mode === 'rename') {
                const fullText = document.getText();
                const cursorOffset = document.offsetAt(position);
                // Find the > that closes the opening tag
                const openTagEnd = fullText.indexOf('>', cursorOffset);
                if (openTagEnd !== -1) {
                    const offsets = findClosingTagOffsets(fullText, openTagEnd + 1);
                    if (offsets) {
                        closingRange = new vscode.Range(
                            document.positionAt(offsets.start),
                            document.positionAt(offsets.end),
                        );
                    }
                }
            }

            const items: vscode.CompletionItem[] = [];

            for (const b of BUILTIN_COMPLETIONS) {
                if (partial && !b.tag.toLowerCase().startsWith(partial)) { continue; }
                const item = new vscode.CompletionItem(
                    { label: `${prefix}${b.tag}`, description: `${EXTENSION_NAME} built-in` },
                    vscode.CompletionItemKind.Keyword
                );
                item.insertText = mode === 'rename'
                    ? `${prefix}${b.tag}`
                    : new vscode.SnippetString(b.snippet);
                item.range = replaceRange;
                item.filterText = `${prefix}${b.tag}`;
                item.sortText = `0_${b.tag}`;
                item.documentation = new vscode.MarkdownString(b.doc);
                items.push(item);
            }

            for (const c of scanComponents()) {
                if (partial && !c.tag.toLowerCase().startsWith(partial)) { continue; }
                const item = new vscode.CompletionItem(
                    { label: `${prefix}${c.tag}`, description: EXTENSION_NAME },
                    vscode.CompletionItemKind.Module
                );
                item.insertText = mode === 'rename'
                    ? `<c-${c.tag}`
                    : new vscode.SnippetString(`<c-${c.tag}$1>$0</c-${c.tag}>`);
                item.range = replaceRange;
                item.filterText = `${prefix}${c.tag}`;
                item.sortText = `1_${c.tag}`;

                // In rename mode: also update the matching closing tag
                if (mode === 'rename' && closingRange) {
                    item.additionalTextEdits = [
                        vscode.TextEdit.replace(closingRange, `</c-${c.tag}>`),
                    ];
                }

                const props = getCachedProps(c.filePath);
                if (props.length) {
                    const sections = props.map(p => formatPropSummary(p));
                    item.documentation = new vscode.MarkdownString(`**c-${c.tag}**\n\n${sections.join('\n\n')}`);
                }
                items.push(item);
            }

            return items;
        } catch (err) {
            console.error('[Cotton] Tag completion error:', err);
            return undefined;
        }
    }
}
