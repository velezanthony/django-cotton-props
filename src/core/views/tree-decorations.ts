import * as vscode from 'vscode';
import { filePathToTag } from '../scanner';
import type { UsageIndex } from '../usage-index';
import { COTTON_TREE_SCHEME, countDiagnostics, isUnused } from './tree-shared';

/**
 * Decorates Cotton tree items. We own the `cotton-tree:` scheme entirely,
 * so this provider only sees URIs from our tree.
 *
 * Priority order for the badge:
 *   error count → warning count → hint count → "U" for unused
 * The colour follows the highest severity present.
 */
export class CottonTreeDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChange.event;

    constructor(private usageIndex?: UsageIndex) {}

    /** Fired by the tree provider when diagnostics or usage state change. */
    refresh(): void {
        this._onDidChange.fire(undefined);
    }

    /** Surgical refresh: only re-evaluate decorations for these URIs. The
     *  input is regular `file://` URIs (what diagnostics events expose);
     *  we map each one to its `cotton-tree://` twin before firing. */
    refreshUris(uris: readonly vscode.Uri[]): void {
        const treeUris = uris
            .filter(u => u.scheme === 'file')
            .map(u => u.with({ scheme: COTTON_TREE_SCHEME }));
        if (treeUris.length === 0) { return; }
        this._onDidChange.fire(treeUris);
    }

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (uri.scheme !== COTTON_TREE_SCHEME) { return undefined; }
        const fileUri = uri.with({ scheme: 'file' });

        const counts = countDiagnostics(fileUri);
        if (counts.error > 0) {
            return {
                badge: badgeNumber(counts.error),
                color: new vscode.ThemeColor('errorForeground'),
                tooltip: `${counts.error} error${counts.error === 1 ? '' : 's'}`,
            };
        }
        if (counts.warning > 0) {
            return {
                badge: badgeNumber(counts.warning),
                color: new vscode.ThemeColor('editorWarning.foreground'),
                tooltip: `${counts.warning} warning${counts.warning === 1 ? '' : 's'}`,
            };
        }
        if (counts.hint > 0) {
            return {
                badge: badgeNumber(counts.hint),
                color: new vscode.ThemeColor('editorHint.foreground'),
                tooltip: `${counts.hint} hint${counts.hint === 1 ? '' : 's'}`,
            };
        }

        // No diagnostics — fall back to the unused decoration if applicable.
        const tag = filePathToTag(fileUri.fsPath);
        if (!tag) { return undefined; }
        if (!isUnused(fileUri.fsPath, tag, this.usageIndex)) { return undefined; }
        return {
            badge: 'U',
            color: new vscode.ThemeColor('descriptionForeground'),
            tooltip: 'Unused — not referenced anywhere in the workspace. Add `{# @ignore-unused #}` to suppress.',
        };
    }
}

/** VS Code FileDecoration badges are limited to two characters. */
function badgeNumber(n: number): string {
    return n > 9 ? '9+' : String(n);
}
