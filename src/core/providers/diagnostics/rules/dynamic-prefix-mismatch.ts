import * as vscode from 'vscode';
import { DIAG_CODE } from '../../../constants';
import { PROP_BLOCK_RE } from '../../../parser';
import { attachQuickFix } from '../quick-fix-data';
import { CVARS_TAG_PARITY_RE, HEAD_DYNAMIC_RE } from './_shared';

interface PropPrefixInfo {
    cleanName: string;
    isDynamic: boolean;
}

function collectPropPrefixes(text: string): Map<string, PropPrefixInfo> {
    const map = new Map<string, PropPrefixInfo>();
    for (const match of text.matchAll(PROP_BLOCK_RE)) {
        const headMatch = HEAD_DYNAMIC_RE.exec(match[1]);
        if (!headMatch) { continue; }
        const isDynamic = headMatch[1] === ':';
        const cleanName = headMatch[2];
        // First @prop wins on conflict — duplicate-prop rule already flags doubles.
        if (!map.has(cleanName)) {
            map.set(cleanName, { cleanName, isDynamic });
        }
    }
    return map;
}

/**
 * Phase 2.4 — `dynamic-prefix-mismatch`.
 *
 * Mirror of gallery `_rules.py:check_prop_against_cvar` (dynamic-prefix branch).
 * Cotton treats `:foo` and `foo` differently at runtime — the `:` form makes
 * the prop a dynamic Python expression rather than a string literal. When
 * @prop and <c-vars> disagree on the prefix, the docstring and the runtime
 * are passing different things to the template.
 *
 * Squiggly goes on the c-vars side because that's the single-line summary
 * the user typically scans; the quick-fix toggles the c-vars prefix to match.
 */
export function checkDynamicPrefixMismatch(
    document: vscode.TextDocument,
    text: string,
): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    const propPrefixes = collectPropPrefixes(text);
    if (propPrefixes.size === 0) { return diagnostics; }

    const cvarsMatch = CVARS_TAG_PARITY_RE.exec(text);
    if (!cvarsMatch) { return diagnostics; }

    const bodyStart = cvarsMatch.index! + cvarsMatch[0].indexOf(cvarsMatch[1]);
    const body = cvarsMatch[1];
    const attrRe = /(:?)([A-Za-z_][\w-]*)(?:=(?:"[^"]*"|[^\s"]+))?/g;

    for (const am of body.matchAll(attrRe)) {
        const cvarsHasPrefix = am[1] === ':';
        const cleanName = am[2];

        const prop = propPrefixes.get(cleanName);
        if (!prop) { continue; } // missing-from-cvars / undocumented owns this case
        if (prop.isDynamic === cvarsHasPrefix) { continue; }

        // Range covers `:name` or `name` — the offending span the user has to flip.
        const matchStart = bodyStart + am.index!;
        const matchEnd = matchStart + am[1].length + am[2].length;

        const propSide = prop.isDynamic ? `:${cleanName}` : cleanName;
        const cvarsSide = cvarsHasPrefix ? `:${cleanName}` : cleanName;

        const diag = new vscode.Diagnostic(
            new vscode.Range(
                document.positionAt(matchStart),
                document.positionAt(matchEnd),
            ),
            `'${cleanName}': ':' prefix mismatch — @prop is '${propSide}' but <c-vars> has '${cvarsSide}'.`,
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE.DYNAMIC_PREFIX_MISMATCH;
        attachQuickFix(diag, {
            kind: 'toggle-dynamic-prefix',
            nameStart: matchStart + am[1].length, // offset of the name itself, after any `:`
            hasPrefix: cvarsHasPrefix,
        });
        diagnostics.push(diag);
    }

    return diagnostics;
}
