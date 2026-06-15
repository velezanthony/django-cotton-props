import * as vscode from 'vscode';
import { DIAG_CODE } from '../../../constants';
import { PROP_BLOCK_RE } from '../../../parser';
import { attachQuickFix } from '../quick-fix-data';
import { CVARS_TAG_PARITY_RE } from './_shared';

/**
 * Phase 2.5 — `missing-cvars`.
 *
 * Mirror of gallery `_rules.py:lint_one` (missing-cvars branch). When a
 * component declares `@prop` annotations but no `<c-vars>` tag, Cotton's
 * runtime does NOT pass anything to the template — the docstring says the
 * props exist, but the template can't read them. Today this fails silently
 * (template just renders blanks where the props should be).
 *
 * The diagnostic is anchored to the FIRST @prop block — that's the
 * earliest visible spot in the file the user would scan when wondering
 * why their component isn't rendering. Quick-fix inserts `<c-vars />`
 * after the last @prop block; the existing MISSING_FROM_CVARS rule then
 * fires and offers "Add all N missing props" to populate it.
 */
export function checkMissingCVars(
    document: vscode.TextDocument,
    text: string,
): vscode.Diagnostic[] {
    const propMatches = [...text.matchAll(PROP_BLOCK_RE)];
    if (propMatches.length === 0) { return []; }

    if (CVARS_TAG_PARITY_RE.test(text)) { return []; }

    const firstPropMatch = propMatches[0];
    const lastPropMatch = propMatches[propMatches.length - 1];
    const insertOffset = lastPropMatch.index! + lastPropMatch[0].length;

    const diag = new vscode.Diagnostic(
        new vscode.Range(
            document.positionAt(firstPropMatch.index!),
            document.positionAt(firstPropMatch.index! + firstPropMatch[0].length),
        ),
        "Component declares @prop annotations but has no <c-vars> tag — Cotton won't pass anything to the template.",
        vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DIAG_CODE.MISSING_CVARS_TAG;
    attachQuickFix(diag, { kind: 'add-empty-cvars', insertOffset });
    return [diag];
}
