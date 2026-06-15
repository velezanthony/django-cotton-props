import * as vscode from 'vscode';
import { DIAG_CODE } from '../../../constants';
import { PROP_BLOCK_RE } from '../../../parser';
import { RAW_DEFAULT_RE } from './_shared';

const HEAD_NAME_TYPE_RE = /^\s*(:?[\w-]+):(\w+)/;
const VALID_BOOL_TOKENS = new Set(['True', 'False', 'true', 'false', '1', '0']);

/**
 * Phase 2.2 — `type-default-mismatch`.
 *
 * Mirror of gallery `_scanners.py:scan_type_default_mismatch`. Reads the
 * raw `default:` value (not the parsed one) because the parser silently
 * coerces unknown boolean tokens to `False` via TRUTHY_TOKENS, hiding the
 * documentation bug at runtime.
 *
 * Validated combinations:
 *   - `boolean` default must be one of True/False/true/false/1/0
 *   - `number`  default must be parseable as int or float
 *   - `text`    no constraint
 *   - `select`  handled by Phase 2.3 (enum-default-out-of-range)
 */
export function checkTypeDefaultMismatch(
    document: vscode.TextDocument,
    text: string,
): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    for (const match of text.matchAll(PROP_BLOCK_RE)) {
        const body = match[1];

        const headMatch = HEAD_NAME_TYPE_RE.exec(body);
        if (!headMatch) { continue; }
        const propName = headMatch[1].replace(/^:/, '');
        const ptype = headMatch[2];
        if (ptype !== 'boolean' && ptype !== 'number') { continue; }

        const defaultMatch = RAW_DEFAULT_RE.exec(body);
        if (!defaultMatch) { continue; }

        const rawValue = defaultMatch[1] ?? defaultMatch[2];
        if (rawValue === undefined) { continue; }

        let problem: string | null = null;
        if (ptype === 'boolean' && !VALID_BOOL_TOKENS.has(rawValue)) {
            problem = `'${propName}': type is 'boolean' but default '${rawValue}' is not a recognised boolean (use True/False/1/0).`;
        } else if (ptype === 'number' && !isParseableNumber(rawValue)) {
            problem = `'${propName}': type is 'number' but default '${rawValue}' is not a valid number.`;
        }
        if (!problem) { continue; }

        const bodyOffset = match.index! + match[0].indexOf(body);
        // Range: pinpoint the value, not the whole `| default:` filter.
        const valueGroupIdx = defaultMatch[1] !== undefined ? 1 : 2;
        const valueOffset = bodyOffset + defaultMatch.index! + defaultMatch[0].lastIndexOf(defaultMatch[valueGroupIdx]);
        const valueLen = defaultMatch[valueGroupIdx].length;

        const diag = new vscode.Diagnostic(
            new vscode.Range(
                document.positionAt(valueOffset),
                document.positionAt(valueOffset + valueLen),
            ),
            problem,
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE.TYPE_DEFAULT_MISMATCH;
        diagnostics.push(diag);
    }

    return diagnostics;
}

function isParseableNumber(s: string): boolean {
    if (s === '') { return false; }
    // Reject lone signs or hex/oct prefixes — Python int()/float() do likewise.
    if (!/^-?\d+(\.\d+)?$/.test(s)) { return false; }
    const n = Number(s);
    return Number.isFinite(n);
}
