import * as vscode from 'vscode';
import { DIAG_CODE } from '../../../constants';
import { PROP_BLOCK_RE } from '../../../parser';
import { attachQuickFix } from '../quick-fix-data';
import { CVARS_TAG_PARITY_RE, RAW_DEFAULT_RE } from './_shared';

const HEAD_SELECT_OPTIONS_RE = /^\s*(:?[\w-]+):select\[([^\]]*)\]/;
const OPTION_LITERAL_RE = /'([^']*)'/g;

function parseOptionLiterals(optionsStr: string): string[] {
    const out: string[] = [];
    for (const m of optionsStr.matchAll(OPTION_LITERAL_RE)) { out.push(m[1]); }
    return out;
}

interface SelectInfo {
    propName: string;
    options: string[];
}

function collectSelectProps(text: string): Map<string, SelectInfo> {
    const map = new Map<string, SelectInfo>();
    for (const match of text.matchAll(PROP_BLOCK_RE)) {
        const body = match[1];
        const headMatch = HEAD_SELECT_OPTIONS_RE.exec(body);
        if (!headMatch) { continue; }
        const propName = headMatch[1].replace(/^:/, '');
        const options = parseOptionLiterals(headMatch[2]);
        if (options.length === 0) { continue; }
        map.set(propName, { propName, options });
    }
    return map;
}

/**
 * Phase 2.3 — `enum-default-out-of-range`.
 *
 * Mirror of gallery `_rules.py:check_prop_against_cvar` (select branch).
 * Two checks for any `select['a','b','c']` prop:
 *   1. `| default:` value must be one of the listed options.
 *   2. The `<c-vars>` value for the same attr must also be one of them
 *      (skipping bare flags and explicit empty strings, like the gallery).
 *
 * Quick-fix: one CodeAction per allowed option that replaces the
 * offending value in place.
 */
export function checkEnumDefaultOutOfRange(
    document: vscode.TextDocument,
    text: string,
): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const selectProps = collectSelectProps(text);
    if (selectProps.size === 0) { return diagnostics; }

    // ── Check @prop defaults against their own option list ──
    for (const match of text.matchAll(PROP_BLOCK_RE)) {
        const body = match[1];
        const headMatch = HEAD_SELECT_OPTIONS_RE.exec(body);
        if (!headMatch) { continue; }
        const propName = headMatch[1].replace(/^:/, '');
        const info = selectProps.get(propName);
        if (!info) { continue; }

        const defaultMatch = RAW_DEFAULT_RE.exec(body);
        if (!defaultMatch) { continue; }
        const valueGroupIdx = defaultMatch[1] !== undefined ? 1 : 2;
        const value = defaultMatch[valueGroupIdx];
        if (value === undefined || value === '' || info.options.includes(value)) { continue; }

        const bodyOffset = match.index! + match[0].indexOf(body);
        const valueOffset = bodyOffset + defaultMatch.index! + defaultMatch[0].lastIndexOf(value);
        const diag = new vscode.Diagnostic(
            new vscode.Range(
                document.positionAt(valueOffset),
                document.positionAt(valueOffset + value.length),
            ),
            `'${propName}': @prop default '${value}' is not in options [${info.options.join(', ')}].`,
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE.ENUM_DEFAULT_OUT_OF_RANGE;
        attachQuickFix(diag, {
            kind: 'replace-with-option',
            replaceStart: valueOffset,
            replaceEnd: valueOffset + value.length,
            options: info.options,
            quoted: false, // already inside "..." in @prop default — replacement is the bare value
        });
        diagnostics.push(diag);
    }

    // ── Check <c-vars> values for any attrs that name a select prop ──
    const cvarsMatch = CVARS_TAG_PARITY_RE.exec(text);
    if (cvarsMatch) {
        const bodyStart = cvarsMatch.index! + cvarsMatch[0].indexOf(cvarsMatch[1]);
        const body = cvarsMatch[1];
        const attrRe = /(:?)([A-Za-z_][\w-]*)(?:=(?:"([^"]*)"|([^\s"]+)))?/g;
        for (const am of body.matchAll(attrRe)) {
            const cleanName = am[2];
            const info = selectProps.get(cleanName);
            if (!info) { continue; }

            const quotedValue = am[3];
            const unquotedValue = am[4];
            const value = quotedValue ?? unquotedValue;
            if (value === undefined || value === '' || info.options.includes(value)) { continue; }

            const valueGroupIdx = quotedValue !== undefined ? 3 : 4;
            const valueOffset = bodyStart + am.index! + am[0].lastIndexOf(am[valueGroupIdx]);
            const diag = new vscode.Diagnostic(
                new vscode.Range(
                    document.positionAt(valueOffset),
                    document.positionAt(valueOffset + value.length),
                ),
                `'${cleanName}': <c-vars> value '${value}' is not in options [${info.options.join(', ')}].`,
                vscode.DiagnosticSeverity.Error,
            );
            diag.code = DIAG_CODE.ENUM_DEFAULT_OUT_OF_RANGE;
            attachQuickFix(diag, {
                kind: 'replace-with-option',
                replaceStart: valueOffset,
                replaceEnd: valueOffset + value.length,
                options: info.options,
                quoted: false, // replacement keeps the source's existing quoting form
            });
            diagnostics.push(diag);
        }
    }

    return diagnostics;
}
