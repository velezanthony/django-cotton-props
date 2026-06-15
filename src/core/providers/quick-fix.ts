import * as vscode from 'vscode';
import { DIAG_CODE } from '../constants';
import { findComponentFile, getCachedProps } from '../scanner';
import { nameVariations } from '../naming';
import { getQuickFix } from './diagnostics/quick-fix-data';

export class CottonQuickFixProvider implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] | undefined {
        const actions: vscode.CodeAction[] = [];
        const text = document.getText();

        // ── Component-level fixes (require <c-vars>) ──
        const cVarsIdx = text.indexOf('<c-vars');
        if (cVarsIdx !== -1) {
            this.addComponentFixes(document, text, cVarsIdx, context, actions);
        }

        // ── Annotation-level fixes (no <c-vars> needed) ──
        this.addRequiredWithDefaultFixes(document, context, actions);
        this.addEnumOptionFixes(document, context, actions);
        this.addDynamicPrefixFixes(document, context, actions);
        this.addMissingCVarsFixes(document, context, actions);
        this.addMissingDescriptionFixes(document, context, actions);

        // ── Usage-level fixes (no <c-vars> needed) ──
        this.addRequiredPropFixes(document, context, actions);

        return actions.length ? actions : undefined;
    }

    private addComponentFixes(
        document: vscode.TextDocument,
        text: string,
        cVarsIdx: number,
        context: vscode.CodeActionContext,
        actions: vscode.CodeAction[],
    ): void {
        const existingProps: { name: string; line: number; order: number }[] = [];
        const propLineRe = /\{#\s*@prop\s+:?([\w-]+):/g;
        let pm;
        while ((pm = propLineRe.exec(text)) !== null) {
            const pos = document.positionAt(pm.index);
            existingProps.push({ name: pm[1], line: pos.line, order: -1 });
        }

        const cVarsLine = text.substring(cVarsIdx, text.indexOf('>', cVarsIdx) + 1);
        const orderRe = /:?([\w_-]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|\w+))?/g;
        let orderIdx = 0;
        let om;
        while ((om = orderRe.exec(cVarsLine)) !== null) {
            orderIdx++;
            const n = om[1];
            const variants = nameVariations(n);
            const ep = existingProps.find(p => variants.includes(p.name));
            if (ep) { ep.order = orderIdx; }
        }

        const cVarsLineNum = document.positionAt(cVarsIdx).line;

        // Document undocumented props
        for (const diag of context.diagnostics) {
            if (diag.code !== DIAG_CODE.UNDOCUMENTED_PROP) { continue; }

            const data = getQuickFix(diag);
            if (!data || data.kind !== 'undocumented') { continue; }
            const { suggestion, cVarsOrder: diagOrder } = data;

            let insertLine = cVarsLineNum;
            for (const ep of existingProps) {
                if (ep.order > diagOrder) {
                    insertLine = ep.line;
                    break;
                }
            }
            if (insertLine === cVarsLineNum && existingProps.length > 0) {
                const lastBefore = existingProps.filter(p => p.order < diagOrder && p.order > 0);
                if (lastBefore.length > 0) {
                    insertLine = lastBefore[lastBefore.length - 1].line + 1;
                }
            }

            const insertPos = new vscode.Position(insertLine, 0);
            const action = new vscode.CodeAction(`Document prop: ${suggestion}`, vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diag];
            action.isPreferred = true;
            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, insertPos, `${suggestion}\n`);
            action.edit = edit;
            actions.push(action);
        }

        // Document all undocumented props (bulk)
        const undocDiags = context.diagnostics
            .filter(d => d.code === DIAG_CODE.UNDOCUMENTED_PROP)
            .sort((a, b) => {
                const da = getQuickFix(a);
                const db = getQuickFix(b);
                const oa = da?.kind === 'undocumented' ? da.cVarsOrder : 0;
                const ob = db?.kind === 'undocumented' ? db.cVarsOrder : 0;
                return oa - ob;
            });

        if (undocDiags.length > 1) {
            const insertPos = new vscode.Position(cVarsLineNum, 0);
            const allSuggestions = undocDiags
                .map(d => {
                    const sd = getQuickFix(d);
                    return sd?.kind === 'undocumented' ? sd.suggestion : '';
                })
                .filter(Boolean);

            if (allSuggestions.length > 1) {
                const action = new vscode.CodeAction(`Document all ${allSuggestions.length} undocumented props`, vscode.CodeActionKind.QuickFix);
                action.diagnostics = [...undocDiags];
                const edit = new vscode.WorkspaceEdit();
                edit.insert(document.uri, insertPos, allSuggestions.join('\n') + '\n');
                action.edit = edit;
                actions.push(action);
            }
        }

        // Sync default (bare attr or value mismatch)
        for (const diag of context.diagnostics) {
            if (diag.code !== DIAG_CODE.SYNC_DEFAULT) { continue; }

            const data = getQuickFix(diag);
            if (!data || data.kind !== 'sync-default') { continue; }

            const replaceRange = new vscode.Range(
                document.positionAt(data.replaceStart),
                document.positionAt(data.replaceEnd),
            );
            const action = new vscode.CodeAction(`Sync <c-vars> default: ${data.newText}`, vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diag];
            action.isPreferred = true;
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, replaceRange, data.newText);
            action.edit = edit;
            actions.push(action);
        }

        // Missing from c-vars
        const missingDiags = context.diagnostics.filter(d => d.code === DIAG_CODE.MISSING_FROM_CVARS);
        for (const diag of missingDiags) {
            const data = getQuickFix(diag);
            if (!data || data.kind !== 'missing-from-cvars') { continue; }

            const insertPos = document.positionAt(data.insertOffset);
            const action = new vscode.CodeAction(`Add to <c-vars>: ${data.attrText}`, vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diag];
            action.isPreferred = true;
            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, insertPos, ` ${data.attrText}`);
            action.edit = edit;
            actions.push(action);
        }

        if (missingDiags.length > 1) {
            const allAttrs = missingDiags
                .map(d => {
                    const md = getQuickFix(d);
                    return md?.kind === 'missing-from-cvars' ? md.attrText : '';
                })
                .filter(Boolean)
                .join(' ');

            if (allAttrs) {
                const firstData = getQuickFix(missingDiags[0]);
                if (firstData?.kind === 'missing-from-cvars') {
                    const insertPos = document.positionAt(firstData.insertOffset);
                    const action = new vscode.CodeAction(`Add all ${missingDiags.length} missing props to <c-vars>`, vscode.CodeActionKind.QuickFix);
                    action.diagnostics = [...missingDiags];
                    const edit = new vscode.WorkspaceEdit();
                    edit.insert(document.uri, insertPos, ` ${allAttrs}`);
                    action.edit = edit;
                    actions.push(action);
                }
            }
        }
    }

    private addRequiredWithDefaultFixes(
        document: vscode.TextDocument,
        context: vscode.CodeActionContext,
        actions: vscode.CodeAction[],
    ): void {
        for (const diag of context.diagnostics) {
            if (diag.code !== DIAG_CODE.REQUIRED_WITH_DEFAULT_CONFLICT) { continue; }

            const data = getQuickFix(diag);
            if (!data || data.kind !== 'required-with-default-conflict') { continue; }

            const dropRequired = new vscode.CodeAction("Remove '| required'", vscode.CodeActionKind.QuickFix);
            dropRequired.diagnostics = [diag];
            dropRequired.isPreferred = true;
            const e1 = new vscode.WorkspaceEdit();
            e1.delete(document.uri, new vscode.Range(
                document.positionAt(data.requiredStart),
                document.positionAt(data.requiredEnd),
            ));
            dropRequired.edit = e1;
            actions.push(dropRequired);

            const dropDefault = new vscode.CodeAction("Remove '| default:'", vscode.CodeActionKind.QuickFix);
            dropDefault.diagnostics = [diag];
            const e2 = new vscode.WorkspaceEdit();
            e2.delete(document.uri, new vscode.Range(
                document.positionAt(data.defaultStart),
                document.positionAt(data.defaultEnd),
            ));
            dropDefault.edit = e2;
            actions.push(dropDefault);
        }
    }

    private addEnumOptionFixes(
        document: vscode.TextDocument,
        context: vscode.CodeActionContext,
        actions: vscode.CodeAction[],
    ): void {
        for (const diag of context.diagnostics) {
            if (diag.code !== DIAG_CODE.ENUM_DEFAULT_OUT_OF_RANGE) { continue; }

            const data = getQuickFix(diag);
            if (!data || data.kind !== 'replace-with-option') { continue; }

            const range = new vscode.Range(
                document.positionAt(data.replaceStart),
                document.positionAt(data.replaceEnd),
            );
            for (const opt of data.options) {
                const action = new vscode.CodeAction(`Replace with '${opt}'`, vscode.CodeActionKind.QuickFix);
                action.diagnostics = [diag];
                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, range, opt);
                action.edit = edit;
                actions.push(action);
            }
        }
    }

    private addDynamicPrefixFixes(
        document: vscode.TextDocument,
        context: vscode.CodeActionContext,
        actions: vscode.CodeAction[],
    ): void {
        for (const diag of context.diagnostics) {
            if (diag.code !== DIAG_CODE.DYNAMIC_PREFIX_MISMATCH) { continue; }

            const data = getQuickFix(diag);
            if (!data || data.kind !== 'toggle-dynamic-prefix') { continue; }

            const action = new vscode.CodeAction(
                data.hasPrefix ? "Remove ':' from <c-vars> attr" : "Add ':' to <c-vars> attr",
                vscode.CodeActionKind.QuickFix,
            );
            action.diagnostics = [diag];
            action.isPreferred = true;
            const edit = new vscode.WorkspaceEdit();
            if (data.hasPrefix) {
                // Delete the `:` immediately before the name.
                edit.delete(document.uri, new vscode.Range(
                    document.positionAt(data.nameStart - 1),
                    document.positionAt(data.nameStart),
                ));
            } else {
                edit.insert(document.uri, document.positionAt(data.nameStart), ':');
            }
            action.edit = edit;
            actions.push(action);
        }
    }

    private addMissingCVarsFixes(
        document: vscode.TextDocument,
        context: vscode.CodeActionContext,
        actions: vscode.CodeAction[],
    ): void {
        for (const diag of context.diagnostics) {
            if (diag.code !== DIAG_CODE.MISSING_CVARS_TAG) { continue; }

            const data = getQuickFix(diag);
            if (!data || data.kind !== 'add-empty-cvars') { continue; }

            const action = new vscode.CodeAction("Add <c-vars /> tag", vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diag];
            action.isPreferred = true;
            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, document.positionAt(data.insertOffset), '\n<c-vars />');
            action.edit = edit;
            actions.push(action);
        }
    }

    private addMissingDescriptionFixes(
        document: vscode.TextDocument,
        context: vscode.CodeActionContext,
        actions: vscode.CodeAction[],
    ): void {
        for (const diag of context.diagnostics) {
            if (diag.code !== DIAG_CODE.MISSING_PROP_DESCRIPTION) { continue; }

            const data = getQuickFix(diag);
            if (!data || data.kind !== 'add-prop-description') { continue; }

            const action = new vscode.CodeAction("Add | description:\"\" filter", vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diag];
            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, document.positionAt(data.insertOffset), ' | description:""');
            action.edit = edit;
            actions.push(action);
        }
    }

    private addRequiredPropFixes(
        document: vscode.TextDocument,
        context: vscode.CodeActionContext,
        actions: vscode.CodeAction[],
    ): void {
        const reqDiags = context.diagnostics.filter(d => d.code === DIAG_CODE.MISSING_REQUIRED);
        if (reqDiags.length === 0) { return; }

        const firstDiag = reqDiags[0];
        const tagStart = document.offsetAt(firstDiag.range.start);
        const fullText = document.getText();
        const afterTag = fullText.substring(tagStart);
        const closeIdx = afterTag.indexOf('>');

        if (closeIdx === -1) { return; }

        const isSelfClosing = afterTag[closeIdx - 1] === '/';
        const insertOffset = tagStart + closeIdx - (isSelfClosing ? 1 : 0);
        const insertPos = document.positionAt(insertOffset);

        const tagNameMatch = firstDiag.message.match(/on '([\w.-]+)'/);
        const tagName = tagNameMatch?.[1];
        if (!tagName) { return; }

        const filePath = findComponentFile(tagName);
        const reqProps = filePath ? getCachedProps(filePath).filter(p => p.required) : [];

        for (const diag of reqDiags) {
            const propMatch = diag.message.match(/Missing required prop '([\w-]+)'/);
            if (!propMatch) { continue; }
            const rp = reqProps.find(p => p.cleanName === propMatch[1]);
            if (!rp) { continue; }

            const val = rp.type === 'boolean' ? 'True' : '';
            const action = new vscode.CodeAction(`Add required prop: ${rp.cleanName}="${val}"`, vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diag];
            action.isPreferred = true;
            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, insertPos, ` ${rp.cleanName}="${val}"`);
            action.edit = edit;
            actions.push(action);
        }

        if (reqDiags.length > 1) {
            const allProps = reqDiags
                .map(d => {
                    const pm = d.message.match(/Missing required prop '([\w-]+)'/);
                    if (!pm) { return ''; }
                    const rp = reqProps.find(p => p.cleanName === pm[1]);
                    if (!rp) { return ''; }
                    const val = rp.type === 'boolean' ? 'True' : '';
                    return `${rp.cleanName}="${val}"`;
                })
                .filter(Boolean)
                .join(' ');

            const action = new vscode.CodeAction(`Add all ${reqDiags.length} required props`, vscode.CodeActionKind.QuickFix);
            action.diagnostics = [...reqDiags];
            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, insertPos, ` ${allProps}`);
            action.edit = edit;
            actions.push(action);
        }
    }
}
