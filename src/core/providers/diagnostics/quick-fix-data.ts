import type * as vscode from 'vscode';
import type { QuickFixData } from '../../models';

const QUICK_FIX_DATA = Symbol('cotton.quickFixData');

export function attachQuickFix(diag: vscode.Diagnostic, data: QuickFixData): void {
    (diag as unknown as Record<symbol, QuickFixData>)[QUICK_FIX_DATA] = data;
}

export function getQuickFix(diag: vscode.Diagnostic): QuickFixData | undefined {
    return (diag as unknown as Record<symbol, QuickFixData>)[QUICK_FIX_DATA];
}
