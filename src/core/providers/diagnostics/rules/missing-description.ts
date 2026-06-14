import * as vscode from 'vscode';
import { DIAG_CODE } from '../../../constants';
import { PROP_BLOCK_RE } from '../../../parser';
import { attachQuickFix } from '../quick-fix-data';
import { HEAD_DYNAMIC_RE } from './_shared';

const HAS_DESCRIPTION_FILTER_RE = /\|\s*description\s*:/;

type MissingDescriptionSeverity = 'hint' | 'warning' | 'off';

/**
 * Reads the user setting that controls how loud the missing-description
 * rule is. Default `hint` keeps it quiet; `warning` matches gallery CLI
 * behaviour; `off` disables.
 *
 * Exposed for tests; production callers go through checkMissingDescription.
 */
export function getMissingDescriptionSeverity(): MissingDescriptionSeverity {
    const raw = vscode.workspace
        .getConfiguration('djangoCottonProps')
        .get<string>('diagnostics.missingDescription.severity', 'hint');
    return raw === 'warning' || raw === 'off' ? raw : 'hint';
}

/**
 * Phase 2.6 — `missing-description`.
 *
 * Mirror of gallery `_rules.py:check_prop_against_cvar` (description branch).
 * Default severity is Hint so legacy components don't drown in yellow
 * markers on file open. The
 * `djangoCottonProps.diagnostics.missingDescription.severity` setting
 * lets teams that want gallery-strict bump it to Warning, or disable.
 */
export function checkMissingDescription(
    document: vscode.TextDocument,
    text: string,
): vscode.Diagnostic[] {
    const severity = getMissingDescriptionSeverity();
    if (severity === 'off') { return []; }

    const vscodeSeverity = severity === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Hint;

    const diagnostics: vscode.Diagnostic[] = [];

    for (const match of text.matchAll(PROP_BLOCK_RE)) {
        const body = match[1];
        if (HAS_DESCRIPTION_FILTER_RE.test(body)) { continue; }

        const headMatch = HEAD_DYNAMIC_RE.exec(body);
        if (!headMatch) { continue; }
        const cleanName = headMatch[2];

        // Range: cover the prop name in the head — that's the anchor the
        // user sees first when scanning the @prop list.
        const bodyOffset = match.index! + match[0].indexOf(body);
        const nameStart = bodyOffset + body.indexOf(cleanName, headMatch[1].length);
        const nameEnd = nameStart + cleanName.length;

        const diag = new vscode.Diagnostic(
            new vscode.Range(
                document.positionAt(nameStart),
                document.positionAt(nameEnd),
            ),
            `'${cleanName}': @prop has no '| description:' filter.`,
            vscodeSeverity,
        );
        diag.code = DIAG_CODE.MISSING_PROP_DESCRIPTION;

        // Insert ` | description:""` right before the closing ` #}`.
        // match[0] looks like `{# @prop body #}` — find the trailing `#}`.
        const closeIdx = match.index! + match[0].lastIndexOf('#}');
        // Skip backwards over any whitespace before `#}` so the inserted
        // filter sits flush against the existing body, not a stray space.
        let insertOffset = closeIdx;
        while (insertOffset > 0 && text.charCodeAt(insertOffset - 1) === 0x20) {
            insertOffset--;
        }
        attachQuickFix(diag, { kind: 'add-prop-description', insertOffset });

        diagnostics.push(diag);
    }

    return diagnostics;
}
