import * as vscode from 'vscode';
import { BUILTIN } from '../constants';
import { findIsAttribute, parseIsAttribute } from '../dynamic-component';
import { cottonTagOpenRe } from '../regex';

/**
 * Refactor actions for switching a tag between its direct form and the
 * `<c-component is="...">` dispatch form:
 *
 *   <c-atoms.button variant="primary">…</c-atoms.button>
 *     ⇅
 *   <c-component is="atoms.button" variant="primary">…</c-component>
 *
 * Useful when a tag that was hardcoded needs to become dynamic, or when a
 * dispatch with a now-static target can be inlined.
 *
 * The provider operates purely on the document text — no scanner lookups —
 * so refactors are available before the workspace finishes indexing.
 */
export class CottonRefactorProvider implements vscode.CodeActionProvider {
    static readonly providedKinds = [vscode.CodeActionKind.RefactorRewrite];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
    ): vscode.CodeAction[] | undefined {
        const text = document.getText();
        const offset = document.offsetAt(range.start);

        const open = findOpeningTagAt(text, offset);
        if (!open) { return undefined; }

        if (open.tag === BUILTIN.COMPONENT) {
            return convertDispatchToDirectAction(document, text, open);
        }
        return [convertDirectToDispatchAction(document, text, open)];
    }
}

// ── Tag locator ───────────────────────────────────────────────────────────

interface OpenTagMatch {
    tag: string;
    attrs: string;
    /** Document offset of the leading `<`. */
    headStart: number;
    /** Document offset one past the closing `>`. */
    headEnd: number;
    selfClose: boolean;
}

/** Find the `<c-NAME ...>` opening tag whose head contains `offset`.
 *  Returns the first match if multiple overlap (cursor at outer tag). */
export function findOpeningTagAt(text: string, offset: number): OpenTagMatch | undefined {
    const re = cottonTagOpenRe();
    let m;
    while ((m = re.exec(text)) !== null) {
        // Half-open interval: [headStart, headEnd). A cursor sitting on the
        // first character of the body (right after `>`) is NOT inside the tag.
        if (offset < m.index || offset >= m.index + m[0].length) { continue; }
        return {
            tag: m[1],
            attrs: m[2] ?? '',
            headStart: m.index,
            headEnd: m.index + m[0].length,
            selfClose: m[3] === '/',
        };
    }
    return undefined;
}

/** Depth-aware locator: given an opening at `searchFrom`, return the
 *  position of its paired `</c-NAME>` close. Handles nested same-name tags. */
export function findClosingTag(
    text: string,
    searchFrom: number,
    tag: string,
): { start: number; end: number } | undefined {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<(/)?c-${escaped}(?![\\w.-])([\\s\\S]*?)>`, 'g');
    re.lastIndex = searchFrom;
    let depth = 1;
    let m;
    while ((m = re.exec(text)) !== null) {
        const isClose = m[1] === '/';
        if (isClose) {
            depth--;
            if (depth === 0) { return { start: m.index, end: m.index + m[0].length }; }
            continue;
        }
        const attrs = m[2] ?? '';
        const selfClose = attrs.trimEnd().endsWith('/');
        if (!selfClose) { depth++; }
    }
    return undefined;
}

// ── Direct → Dispatch ─────────────────────────────────────────────────────

function convertDirectToDispatchAction(
    document: vscode.TextDocument,
    text: string,
    open: OpenTagMatch,
): vscode.CodeAction {
    const action = new vscode.CodeAction(
        `Convert to <c-component is="${open.tag}">`,
        vscode.CodeActionKind.RefactorRewrite,
    );
    const edit = new vscode.WorkspaceEdit();

    // Replace the head: `<c-tag<attrs><self?>>` → `<c-component is="tag"<attrs><self?>>`.
    // We keep <attrs> verbatim — preserve user formatting (newlines, quoting style).
    const headReplacement = `<c-component is="${open.tag}"${open.attrs}${open.selfClose ? ' />' : '>'}`;
    edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(open.headStart), document.positionAt(open.headEnd)),
        headReplacement,
    );

    if (!open.selfClose) {
        const close = findClosingTag(text, open.headEnd, open.tag);
        if (close) {
            edit.replace(
                document.uri,
                new vscode.Range(document.positionAt(close.start), document.positionAt(close.end)),
                '</c-component>',
            );
        }
    }

    action.edit = edit;
    return action;
}

// ── Dispatch → Direct ─────────────────────────────────────────────────────

function convertDispatchToDirectAction(
    document: vscode.TextDocument,
    text: string,
    open: OpenTagMatch,
): vscode.CodeAction[] | undefined {
    const isAttr = findIsAttribute(open.attrs);
    if (!isAttr) { return undefined; }

    const parsed = parseIsAttribute(isAttr.raw, isAttr.isExpression);
    if (parsed.kind !== 'literal') { return undefined; }
    const target = parsed.target;

    const action = new vscode.CodeAction(
        `Inline <c-component is="${target}"> as <c-${target}>`,
        vscode.CodeActionKind.RefactorRewrite,
    );
    const edit = new vscode.WorkspaceEdit();

    const strippedAttrs = stripIsAttribute(open.attrs);
    const headReplacement = `<c-${target}${strippedAttrs}${open.selfClose ? ' />' : '>'}`;
    edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(open.headStart), document.positionAt(open.headEnd)),
        headReplacement,
    );

    if (!open.selfClose) {
        const close = findClosingTag(text, open.headEnd, BUILTIN.COMPONENT);
        if (close) {
            edit.replace(
                document.uri,
                new vscode.Range(document.positionAt(close.start), document.positionAt(close.end)),
                `</c-${target}>`,
            );
        }
    }

    action.edit = edit;
    return [action];
}

/** Remove the first `is="..."` / `:is="..."` attribute from an attribute
 *  string, including its leading whitespace. Preserves the rest verbatim. */
export function stripIsAttribute(attrs: string): string {
    return attrs.replace(/\s(:?)is=(["'])[^"']*\2/, '');
}
