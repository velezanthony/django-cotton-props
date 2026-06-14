import * as vscode from 'vscode';
import { isCottonFile, filePathToTag } from '../scanner';
import type { UsageIndex } from '../usage-index';

export class CottonCodeLensProvider implements vscode.CodeLensProvider {

    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChange.event;

    constructor(private usageIndex: UsageIndex) {}

    refresh(): void {
        this._onDidChange.fire();
    }

    async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        if (!isCottonFile(document.uri)) { return []; }

        const tag = filePathToTag(document.uri.fsPath);
        if (!tag) { return []; }

        await this.usageIndex.ready;
        const usage = this.usageIndex.getUsage(tag);
        const lineRange = document.lineAt(0).range;

        const countTitle = usage.total === 0
            ? '0 usages'
            : `${usage.total} usage${usage.total === 1 ? '' : 's'} in ${usage.fileCount} file${usage.fileCount === 1 ? '' : 's'}`;

        const lens = new vscode.CodeLens(lineRange, {
            title: countTitle,
            command: usage.total > 0 ? 'editor.action.referenceSearch.trigger' : '',
            arguments: [],
        });

        return [lens];
    }
}
