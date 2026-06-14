import * as vscode from 'vscode';

const ANNOTATION_LINE_RE = /^\s*\{#\s*@(prop|slot|trigger|strict)\b/;

export class CottonFoldingProvider implements vscode.FoldingRangeProvider {

    provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
        const ranges: vscode.FoldingRange[] = [];
        const totalLines = document.lineCount;

        let blockStart = -1;

        for (let i = 0; i < totalLines; i++) {
            const isAnnotation = ANNOTATION_LINE_RE.test(document.lineAt(i).text);

            if (isAnnotation) {
                if (blockStart === -1) {
                    blockStart = i;
                }
            } else if (blockStart !== -1) {
                const end = i - 1;
                if (end > blockStart) {
                    ranges.push(new vscode.FoldingRange(blockStart, end, vscode.FoldingRangeKind.Region));
                }
                blockStart = -1;
            }
        }

        if (blockStart !== -1) {
            const end = totalLines - 1;
            if (end > blockStart) {
                ranges.push(new vscode.FoldingRange(blockStart, end, vscode.FoldingRangeKind.Region));
            }
        }

        return ranges;
    }
}
