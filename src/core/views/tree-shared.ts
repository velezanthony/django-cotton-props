import * as vscode from 'vscode';
import { getCachedComponent } from '../scanner';
import type { UsageIndex } from '../usage-index';

/**
 * Shared building blocks for the Cotton Components tree: types, the
 * custom URI scheme, and the diagnostic / unused predicates used by
 * both the tree items and the decoration provider.
 *
 * Kept in one tiny module so `tree-decorations.ts` and `component-tree.ts`
 * can each import what they need without depending on the other.
 */

/** Custom URI scheme used purely so we can target the FileDecorationProvider
 *  at component tree items without conflicting with file:// decorations. */
export const COTTON_TREE_SCHEME = 'cotton-tree';

export interface SeverityCounts {
    error: number;
    warning: number;
    info: number;
    hint: number;
}

export function countDiagnostics(uri: vscode.Uri): SeverityCounts {
    const counts: SeverityCounts = { error: 0, warning: 0, info: 0, hint: 0 };
    for (const d of vscode.languages.getDiagnostics(uri)) {
        switch (d.severity) {
            case vscode.DiagnosticSeverity.Error:       counts.error++;   break;
            case vscode.DiagnosticSeverity.Warning:     counts.warning++; break;
            case vscode.DiagnosticSeverity.Information: counts.info++;    break;
            case vscode.DiagnosticSeverity.Hint:        counts.hint++;    break;
        }
    }
    return counts;
}

export function isUnused(filePath: string, tag: string, usageIndex: UsageIndex | undefined): boolean {
    if (!usageIndex) { return false; }
    if (getCachedComponent(filePath).ignoreUnused) { return false; }
    return usageIndex.getUsage(tag).total === 0;
}
