import * as vscode from 'vscode';
import { DIAG_CODE } from '../../../constants';
import { PROP_BLOCK_RE } from '../../../parser';
import { attachQuickFix } from '../quick-fix-data';

const HAS_REQUIRED_RE = /\|\s*required\b/;
const HAS_DEFAULT_FILTER_RE = /\|\s*default\s*:\s*(?:"[^"]*"|\S+)/;
const HEAD_NAME_RE = /^\s*(:?[\w-]+):/;

/**
 * Phase 2.1 — `required-with-default` conflict.
 *
 * Mirror of gallery `_scanners.py:scan_required_with_default`. The parser
 * silently drops `required` whenever a `default:` is present, which means
 * a documentation reader thinks the prop is required but it isn't. Surface
 * that as an Error so the inconsistency is visible at edit time.
 */
export function checkRequiredWithDefault(
    document: vscode.TextDocument,
    text: string,
): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    for (const match of text.matchAll(PROP_BLOCK_RE)) {
        const body = match[1];
        const reqMatch = HAS_REQUIRED_RE.exec(body);
        const defaultMatch = HAS_DEFAULT_FILTER_RE.exec(body);
        if (!reqMatch || !defaultMatch) { continue; }

        const headMatch = HEAD_NAME_RE.exec(body);
        const propName = headMatch ? headMatch[1].replace(/^:/, '') : '?';

        const bodyOffset = match.index! + match[0].indexOf(body);

        const requiredStart = bodyOffset + reqMatch.index!;
        const requiredEnd = requiredStart + reqMatch[0].length;
        const defaultStart = bodyOffset + defaultMatch.index!;
        const defaultEnd = defaultStart + defaultMatch[0].length;

        const diag = new vscode.Diagnostic(
            new vscode.Range(
                document.positionAt(requiredStart),
                document.positionAt(requiredEnd),
            ),
            `'${propName}': cannot use '| required' with '| default:' — a required prop has no fallback. The parser will silently drop 'required'.`,
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE.REQUIRED_WITH_DEFAULT_CONFLICT;
        attachQuickFix(diag, {
            kind: 'required-with-default-conflict',
            requiredStart: extendLeft(text, requiredStart),
            requiredEnd,
            defaultStart: extendLeft(text, defaultStart),
            defaultEnd,
        });
        diagnostics.push(diag);
    }

    return diagnostics;
}

/**
 * Stretch the start offset back over a leading space so removing the
 * filter leaves a clean ` | a | b` body without orphan double-spaces.
 */
function extendLeft(text: string, offset: number): number {
    return offset > 0 && text.charCodeAt(offset - 1) === 0x20 /* space */
        ? offset - 1
        : offset;
}
