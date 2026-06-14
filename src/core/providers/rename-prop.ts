import * as vscode from 'vscode';
import { isCottonFile, filePathToTag } from '../scanner';
import { toSnake, toKebab, nameVariations } from '../naming';
import type { UsageIndex } from '../usage-index';

interface PropAtPosition {
    name: string;       // canonical kebab-case name
    isDynamic: boolean; // had : prefix
    range: vscode.Range;
}

export class CottonRenameProvider implements vscode.RenameProvider {
    constructor(private usageIndex: UsageIndex) {}

    prepareRename(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<{ range: vscode.Range; placeholder: string }> {
        if (!isCottonFile(document.uri)) { return undefined; }

        const prop = this.findPropAtPosition(document, position);
        if (!prop) { return undefined; }

        return { range: prop.range, placeholder: prop.name };
    }

    async provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: string): Promise<vscode.WorkspaceEdit | undefined> {
        if (!isCottonFile(document.uri)) { return undefined; }

        const prop = this.findPropAtPosition(document, position);
        if (!prop) { return undefined; }

        const oldName = prop.name;
        const tag = filePathToTag(document.uri.fsPath);
        if (!tag || oldName === toKebab(newName)) { return undefined; }

        const edit = new vscode.WorkspaceEdit();
        const text = document.getText();

        // 1. @prop annotation
        this.renamePropAnnotation(edit, document, text, oldName, newName, prop.isDynamic);

        // 2. <c-vars> attribute
        this.renameCVarsAttr(edit, document, text, oldName, newName);

        // 3. Template body (snake_case references)
        this.renameTemplateBody(edit, document, text, oldName, newName);

        // 4. All usage files
        await this.renameInUsageFiles(edit, tag, oldName, newName);

        return edit;
    }

    private findPropAtPosition(document: vscode.TextDocument, position: vscode.Position): PropAtPosition | undefined {
        const line = document.lineAt(position.line).text;
        const char = position.character;

        // Check @prop annotation: {# @prop :?name:type... #}
        const propRe = /\{#\s*@prop\s+(:?)([\w-]+):/;
        const propMatch = line.match(propRe);
        if (propMatch) {
            const isDynamic = propMatch[1] === ':';
            const name = propMatch[2];
            const nameStart = line.indexOf(name, line.indexOf('@prop') + 5);
            const nameEnd = nameStart + name.length;
            if (char >= nameStart && char <= nameEnd) {
                return { name, isDynamic, range: new vscode.Range(position.line, nameStart, position.line, nameEnd) };
            }
        }

        // Check <c-vars> attribute
        if (/<c-vars\s/.test(line)) {
            const attrRe = /(:?)([\w_-]+)(?:\s*=)?/g;
            let m;
            while ((m = attrRe.exec(line)) !== null) {
                const isDynamic = m[1] === ':';
                const rawName = m[2];
                const nameStart = m.index + m[1].length;
                const nameEnd = nameStart + rawName.length;
                if (char >= nameStart && char <= nameEnd) {
                    return { name: toKebab(rawName), isDynamic, range: new vscode.Range(position.line, nameStart, position.line, nameEnd) };
                }
            }
        }

        return undefined;
    }

    private renamePropAnnotation(edit: vscode.WorkspaceEdit, document: vscode.TextDocument, text: string, oldName: string, newName: string, isDynamic: boolean): void {
        const prefix = isDynamic ? ':' : '';
        const pattern = new RegExp(`(\\{#\\s*@prop\\s+)${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(:)`, 'g');
        let m;
        while ((m = pattern.exec(text)) !== null) {
            const nameStart = m.index + m[1].length + prefix.length;
            const nameEnd = nameStart + oldName.length;
            edit.replace(document.uri,
                new vscode.Range(document.positionAt(nameStart), document.positionAt(nameEnd)),
                toKebab(newName),
            );
        }
    }

    private renameCVarsAttr(edit: vscode.WorkspaceEdit, document: vscode.TextDocument, text: string, oldName: string, newName: string): void {
        const cVarsMatch = text.match(/<c-vars\s+([^>]*)>/);
        if (!cVarsMatch) { return; }

        const cVarsStart = text.indexOf(cVarsMatch[0]);
        const attrsStr = cVarsMatch[1];

        for (const oldVariant of nameVariations(oldName)) {
            const attrRe = new RegExp(`(:?)(${oldVariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=\\s|=|>|/)`, 'g');
            let m;
            while ((m = attrRe.exec(attrsStr)) !== null) {
                const nameStart = cVarsStart + cVarsMatch[0].indexOf(attrsStr) + m.index + m[1].length;
                const nameEnd = nameStart + oldVariant.length;
                // Preserve original case convention: if c-vars used snake, keep snake
                const replacement = oldVariant.includes('_') ? toSnake(newName) : toKebab(newName);
                edit.replace(document.uri,
                    new vscode.Range(document.positionAt(nameStart), document.positionAt(nameEnd)),
                    replacement,
                );
            }
        }
    }

    private renameTemplateBody(edit: vscode.WorkspaceEdit, document: vscode.TextDocument, text: string, oldName: string, newName: string): void {
        // Template body starts after <c-vars ...>
        const cVarsMatch = text.match(/<c-vars\s+[^>]*>/);
        if (!cVarsMatch) { return; }
        const bodyStart = text.indexOf(cVarsMatch[0]) + cVarsMatch[0].length;
        const body = text.substring(bodyStart);

        // In Django templates, props are snake_case
        const oldSnake = toSnake(oldName);
        const newSnake = toSnake(newName);
        if (oldSnake === newSnake) { return; }

        // Match prop name as a whole word (not inside another word)
        const re = new RegExp(`\\b${oldSnake.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        let m;
        while ((m = re.exec(body)) !== null) {
            const absStart = bodyStart + m.index;
            edit.replace(document.uri,
                new vscode.Range(document.positionAt(absStart), document.positionAt(absStart + oldSnake.length)),
                newSnake,
            );
        }
    }

    private async renameInUsageFiles(edit: vscode.WorkspaceEdit, tag: string, oldName: string, newName: string): Promise<void> {
        await this.usageIndex.ready;
        const filePaths = this.usageIndex.getFilePaths(tag);

        for (const filePath of filePaths) {
            try {
                const uri = vscode.Uri.file(filePath);
                const doc = await vscode.workspace.openTextDocument(uri);
                const text = doc.getText();

                // Find all <c-tag ... oldName=... > occurrences
                const tagRe = new RegExp(`<c-${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s[^>]*)`, 'g');
                let tagMatch;
                while ((tagMatch = tagRe.exec(text)) !== null) {
                    const attrsStr = tagMatch[1];
                    const attrsStart = tagMatch.index + `<c-${tag}`.length;

                    for (const oldVariant of nameVariations(oldName)) {
                        // Match :?oldName followed by = or space or >
                        const attrRe = new RegExp(`(:?)(${oldVariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=\\s*=|\\s|>|/)`, 'g');
                        let attrMatch;
                        while ((attrMatch = attrRe.exec(attrsStr)) !== null) {
                            const nameStart = attrsStart + attrMatch.index + attrMatch[1].length;
                            const nameEnd = nameStart + oldVariant.length;
                            edit.replace(uri,
                                new vscode.Range(doc.positionAt(nameStart), doc.positionAt(nameEnd)),
                                toKebab(newName),
                            );
                        }
                    }
                }
            } catch (err) {
                console.error(`[Cotton] Failed to rename prop in: ${filePath}`, err);
            }
        }
    }
}
