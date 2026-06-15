import * as vscode from 'vscode';
import { DIAG_CODE } from '../../constants';
import { toKebab } from '../../naming';
import { attachQuickFix } from './quick-fix-data';
import { nameVariations, SeenDefs } from './shared';

const PROP_DEF_RE = /\{#\s*@prop\s+(:?)([\w-]+):.*?#\}/g;
const CVARS_ATTR_RE = /:?([\w_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\w+)))?/g;
const RAW_ATTR_RE = /(:?)([\w_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\w+)))?/g;
const VARS_ATTR_RE = /:?([\w_-]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|\w+))?/g;
const CVARS_TAG_RE = /<c-vars\s+([^>]*)>/;

export interface CVarsInfo {
    match: RegExpMatchArray;
    attrs: string;
    start: number;
    tagRange: vscode.Range;
    names: Set<string>;
    values: Map<string, string | null>;
    insertOffset: number;
}

export function extractCVarsInfo(document: vscode.TextDocument, text: string): CVarsInfo | undefined {
    const match = text.match(CVARS_TAG_RE);
    if (!match) { return undefined; }

    const attrs = match[1];
    const start = text.indexOf(match[0]);
    const tagRange = new vscode.Range(
        document.positionAt(start),
        document.positionAt(start + match[0].length),
    );

    const names = new Set<string>();
    const values = new Map<string, string | null>();
    for (const cv of attrs.matchAll(CVARS_ATTR_RE)) {
        const attrName = cv[1];
        const attrValue = cv[2] ?? cv[3] ?? cv[4] ?? null;
        nameVariations(attrName).forEach(v => names.add(v));
        values.set(attrName, attrValue);
    }

    const endOffset = start + match[0].length;
    const insertOffset = match[0].endsWith('/>') ? endOffset - 2 : endOffset - 1;

    return { match, attrs, start, tagRange, names, values, insertOffset };
}

export function checkDuplicateProps(
    document: vscode.TextDocument,
    text: string,
): { diagnostics: vscode.Diagnostic[]; seenDefs: SeenDefs } {
    const diagnostics: vscode.Diagnostic[] = [];
    const seenDefs: SeenDefs = new Map();

    for (const match of text.matchAll(PROP_DEF_RE)) {
        const isDynamic = match[1] === ':';
        const propName = match[2];
        const nameIdx = match.index! + match[0].indexOf(propName);
        const defaultMatch = match[0].match(/\|\s*default:\s*(?:"([^"]*)"|(\w+))/);
        const hasDefault = !!defaultMatch;
        const defaultValue = hasDefault ? (defaultMatch![1] ?? defaultMatch![2] ?? '') : '';

        if (seenDefs.has(propName)) {
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(document.positionAt(nameIdx), document.positionAt(nameIdx + propName.length)),
                `Duplicate @prop definition '${propName}'`,
                vscode.DiagnosticSeverity.Error,
            ));
        } else {
            seenDefs.set(propName, { index: nameIdx, hasDefault, defaultValue, isDynamic });
        }
    }

    return { diagnostics, seenDefs };
}

export function checkPropsMissingFromCVars(
    document: vscode.TextDocument,
    seenDefs: SeenDefs,
    cvars: CVarsInfo,
): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    for (const [propName, propInfo] of seenDefs) {
        const found = nameVariations(propName).some(v => cvars.names.has(v));
        if (found) { continue; }

        const message = propInfo.hasDefault
            ? `@prop '${propName}' defines default '${propInfo.defaultValue}' but is missing from <c-vars>`
            : `@prop '${propName}' is defined but missing from <c-vars>`;
        const diag = new vscode.Diagnostic(cvars.tagRange, message, vscode.DiagnosticSeverity.Warning);
        diag.code = DIAG_CODE.MISSING_FROM_CVARS;

        const prefix = propInfo.isDynamic ? ':' : '';
        let attrText: string;
        if (!propInfo.hasDefault || propInfo.defaultValue === '') {
            attrText = `${prefix}${propName}`;
        } else if (!propInfo.isDynamic && (propInfo.defaultValue === 'True' || propInfo.defaultValue === 'False')) {
            attrText = `${prefix}${propName}=${propInfo.defaultValue}`;
        } else {
            attrText = `${prefix}${propName}="${propInfo.defaultValue}"`;
        }

        attachQuickFix(diag, {
            kind: 'missing-from-cvars',
            attrText,
            insertOffset: cvars.insertOffset,
        });
        diagnostics.push(diag);
    }

    return diagnostics;
}

export function checkDefaultConsistency(
    document: vscode.TextDocument,
    seenDefs: SeenDefs,
    cvars: CVarsInfo,
): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const cVarsFullTag = cvars.match[0];

    for (const [cVarsName, cVarsValue] of cvars.values) {
        const propEntry = [...seenDefs.entries()].find(([propName]) =>
            nameVariations(propName).some(v => nameVariations(cVarsName).includes(v)),
        );
        if (!propEntry) { continue; }

        const [, propInfo] = propEntry;
        const tagIdx = cVarsFullTag.indexOf(cVarsName);
        const attrIdx = cvars.start + tagIdx;
        const hasPrefix = tagIdx > 0 && cVarsFullTag[tagIdx - 1] === ':';

        const buildAttr = (value: string): string => {
            const prefix = hasPrefix ? ':' : '';
            if (!hasPrefix && (value === 'True' || value === 'False')) {
                return `${prefix}${cVarsName}=${value}`;
            }
            return `${prefix}${cVarsName}="${value}"`;
        };

        if (propInfo.hasDefault && propInfo.defaultValue !== '' && cVarsValue === null) {
            const diagRange = new vscode.Range(document.positionAt(attrIdx), document.positionAt(attrIdx + cVarsName.length));
            const diag = new vscode.Diagnostic(
                diagRange,
                `@prop defines default '${propInfo.defaultValue}' for '${cVarsName}' but <c-vars> has no value`,
                vscode.DiagnosticSeverity.Information,
            );
            diag.code = DIAG_CODE.SYNC_DEFAULT;
            const fullStart = attrIdx - (hasPrefix ? 1 : 0);
            attachQuickFix(diag, {
                kind: 'sync-default',
                replaceStart: fullStart,
                replaceEnd: attrIdx + cVarsName.length,
                newText: buildAttr(propInfo.defaultValue),
            });
            diagnostics.push(diag);
        }

        if (!propInfo.hasDefault && cVarsValue !== null) {
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(document.positionAt(attrIdx), document.positionAt(attrIdx + cVarsName.length)),
                `'${cVarsName}' has default '${cVarsValue}' in <c-vars> but @prop doesn't document a default`,
                vscode.DiagnosticSeverity.Information,
            ));
        }

        if (propInfo.hasDefault && cVarsValue !== null && propInfo.defaultValue !== cVarsValue) {
            const diagRange = new vscode.Range(document.positionAt(attrIdx), document.positionAt(attrIdx + cVarsName.length));
            const diag = new vscode.Diagnostic(
                diagRange,
                `Default mismatch for '${cVarsName}': @prop says '${propInfo.defaultValue}' but <c-vars> has '${cVarsValue}'`,
                vscode.DiagnosticSeverity.Warning,
            );
            diag.code = DIAG_CODE.SYNC_DEFAULT;
            const fullAttrRe = new RegExp(`(:?${cVarsName})\\s*=\\s*(?:"[^"]*"|'[^']*'|\\w+)`);
            const fullMatch = cVarsFullTag.match(fullAttrRe);
            if (fullMatch && fullMatch.index !== undefined) {
                const fullStart = cvars.start + fullMatch.index;
                attachQuickFix(diag, {
                    kind: 'sync-default',
                    replaceStart: fullStart,
                    replaceEnd: fullStart + fullMatch[0].length,
                    newText: buildAttr(propInfo.defaultValue),
                });
            }
            diagnostics.push(diag);
        }
    }

    return diagnostics;
}

export function checkUndocumentedProps(
    document: vscode.TextDocument,
    seenDefs: SeenDefs,
    cvars: CVarsInfo,
): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    const docNames = new Set<string>();
    for (const [propName] of seenDefs) {
        nameVariations(propName).forEach(v => docNames.add(v));
    }

    const cVarsFullTag = cvars.match[0];
    let cVarsOrder = 0;

    for (const match of cvars.attrs.matchAll(RAW_ATTR_RE)) {
        const isDyn = match[1] === ':';
        const attrName = match[2];
        const attrVal = match[3] ?? match[4] ?? match[5] ?? '';
        cVarsOrder++;

        const isDocumented = nameVariations(attrName).some(v => docNames.has(v));
        if (isDocumented) { continue; }

        let guessType = 'text';
        if (attrVal === 'True' || attrVal === 'False') { guessType = 'boolean'; }
        else if (attrVal !== '' && !isNaN(Number(attrVal))) { guessType = 'number'; }

        const propName = toKebab(attrName);
        const prefix = isDyn ? ':' : '';
        const defFilter = attrVal !== '' ? ` | default:${guessType === 'text' ? `"${attrVal}"` : attrVal}` : '';
        const suggestion = `{# @prop ${prefix}${propName}:${guessType}${defFilter} | description:"Description" #}`;

        const attrIdx = cvars.start + cVarsFullTag.indexOf(attrName, match.index!);
        const diag = new vscode.Diagnostic(
            new vscode.Range(document.positionAt(attrIdx), document.positionAt(attrIdx + attrName.length)),
            `'${attrName}' is not documented. Add:\n${suggestion}`,
            vscode.DiagnosticSeverity.Information,
        );
        diag.code = DIAG_CODE.UNDOCUMENTED_PROP;
        attachQuickFix(diag, {
            kind: 'undocumented',
            suggestion,
            cVarsOrder,
        });
        diagnostics.push(diag);
    }

    return diagnostics;
}

export function checkUnusedProps(
    document: vscode.TextDocument,
    cvars: CVarsInfo,
    text: string,
): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const cVarsFullStart = text.indexOf(cvars.match[0]);
    const cVarsCloseIdx = text.indexOf('>', cVarsFullStart);
    const body = cVarsCloseIdx > 0 ? text.substring(cVarsCloseIdx + 1) : '';

    if (!body) { return diagnostics; }

    for (const match of cvars.match[1].matchAll(VARS_ATTR_RE)) {
        const varName = match[1];
        const isUsed = nameVariations(varName).some(v => body.includes(v));
        if (isUsed) { continue; }

        const varIdx = cVarsFullStart + cvars.match[0].indexOf(varName, match.index!);
        diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(document.positionAt(varIdx), document.positionAt(varIdx + varName.length)),
            `'${varName}' is defined in <c-vars> but never used in the template`,
            vscode.DiagnosticSeverity.Warning,
        ));
    }

    return diagnostics;
}

