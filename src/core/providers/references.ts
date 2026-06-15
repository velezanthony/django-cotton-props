import * as vscode from 'vscode';
import { COTTON_TAG_RE } from '../constants';
import { escapeRegex } from '../regex';
import type { UsageIndex } from '../usage-index';

export class CottonReferenceProvider implements vscode.ReferenceProvider {
    constructor(private usageIndex: UsageIndex) {}

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.Location[]> {
        const line = document.lineAt(position.line).text;
        const char = position.character;

        for (const match of line.matchAll(COTTON_TAG_RE)) {
            if (char >= match.index! && char <= match.index! + match[0].length) {
                return this.findUsages(match[1]);
            }
        }

        return [];
    }

    private async findUsages(tag: string): Promise<vscode.Location[]> {
        await this.usageIndex.ready;

        const locations: vscode.Location[] = [];
        const direct = `c-${tag}`;
        const filePaths = this.usageIndex.getFilePaths(tag);
        const dispatchRe = new RegExp(
            `<c-component\\b[^>]*\\bis=(?:"${escapeRegex(tag)}"|'${escapeRegex(tag)}')`,
            'g',
        );

        for (const filePath of filePaths) {
            try {
                const uri = vscode.Uri.file(filePath);
                const doc = await vscode.workspace.openTextDocument(uri);
                const text = doc.getText();
                let idx = 0;

                // Direct `<c-tag>` (and `</c-tag>`) references.
                while ((idx = text.indexOf(direct, idx)) !== -1) {
                    locations.push(new vscode.Location(uri, doc.positionAt(idx)));
                    idx += direct.length;
                }

                // `<c-component is="tag">` dispatch references.
                for (const dm of text.matchAll(dispatchRe)) {
                    locations.push(new vscode.Location(uri, doc.positionAt(dm.index!)));
                }
            } catch (err) { console.error(`[Cotton] Failed to read file for references: ${filePath}`, err); }
        }

        return locations;
    }
}

