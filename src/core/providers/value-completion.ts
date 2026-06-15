import * as vscode from 'vscode';
import { findComponentFile, getCachedProps } from '../scanner';
import { findTagContext } from '../helpers';

export class ValueCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
        const line = document.lineAt(position.line).text;
        const before = line.substring(0, position.character);

        const valueMatch = before.match(/:?([\w-]+)=["']([^"']*)$/);
        if (!valueMatch) { return undefined; }

        const attrName = valueMatch[1];
        const offset = document.offsetAt(position);
        const tag = findTagContext(document, offset);
        if (!tag) { return undefined; }

        const filePath = findComponentFile(tag);
        if (!filePath) { return undefined; }

        const props = getCachedProps(filePath);
        const prop = props.find(p => p.cleanName === attrName);
        if (!prop) { return undefined; }

        if (prop.type === 'select' && prop.options.length) {
            return prop.options.map((opt, i) => {
                const item = new vscode.CompletionItem(opt, vscode.CompletionItemKind.EnumMember);
                item.sortText = String(i).padStart(3, '0');
                if (opt === prop.defaultValue) {
                    item.detail = '(default)';
                    item.preselect = true;
                }
                return item;
            });
        }

        if (prop.type === 'boolean') {
            return ['True', 'False'].map(v => {
                const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.EnumMember);
                if (v === prop.defaultValue) {
                    item.detail = '(default)';
                    item.preselect = true;
                }
                return item;
            });
        }

        return undefined;
    }
}
