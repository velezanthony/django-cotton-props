import * as vscode from 'vscode';
import { findComponentFile, getCachedProps } from '../scanner';
import { formatPropDocs } from '../formatting';
import { findTagContext, isInsideAttributeValue } from '../helpers';

export class PropCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
        const linePrefix = document.lineAt(position.line).text.substring(0, position.character);
        // Inside an open `attr="..."` value only VALUE completions belong; don't
        // leak the prop list into the quotes (ValueCompletionProvider handles it).
        if (isInsideAttributeValue(linePrefix)) { return undefined; }

        // While the cursor is still glued to the tag name (no separating space
        // yet) the user is editing the NAME — e.g. mid-edit after deleting a
        // letter — not adding attributes. The name may even resolve transiently
        // to a real component, but its props are premature here: props belong in
        // attribute position, after the tag name AND a space.
        if (/<c-[\w.-]*$/.test(linePrefix)) { return undefined; }

        const offset = document.offsetAt(position);
        const tag = findTagContext(document, offset);
        if (!tag) { return undefined; }

        const filePath = findComponentFile(tag);
        if (!filePath) { return undefined; }

        const props = getCachedProps(filePath);
        if (!props.length) { return undefined; }

        return props
            .filter(p => !p.hidden)
            .flatMap(p => {
                const items: vscode.CompletionItem[] = [];
                const isDeprecated = p.deprecated !== undefined;

                const item = new vscode.CompletionItem(p.cleanName, vscode.CompletionItemKind.Field);
                const placeholder = p.type === 'boolean' ? (p.defaultValue || 'True') : (p.defaultValue || '');
                item.insertText = new vscode.SnippetString(`${p.cleanName}="\${1:${placeholder}}"`);
                item.detail = `${p.type}${p.options.length ? ` [${p.options.map(o => `'${o}'`).join(', ')}]` : ''}${p.hasDefault ? ` = "${p.defaultValue}"` : ''}${p.required ? ' (required)' : ''}`;
                item.documentation = formatPropDocs(p);
                item.sortText = `${isDeprecated ? '2' : '0'}_${p.cleanName}`;
                if (isDeprecated) { item.tags = [vscode.CompletionItemTag.Deprecated]; }
                items.push(item);

                const dynItem = new vscode.CompletionItem(`:${p.cleanName}`, vscode.CompletionItemKind.Field);
                dynItem.insertText = new vscode.SnippetString(`:${p.cleanName}="\${1:${p.defaultValue}}"`);
                dynItem.detail = `Django template variable`;
                dynItem.documentation = formatPropDocs(p, true);
                dynItem.sortText = `${isDeprecated ? '3' : '1'}_${p.cleanName}`;
                if (isDeprecated) { dynItem.tags = [vscode.CompletionItemTag.Deprecated]; }
                items.push(dynItem);

                return items;
            });
    }
}
