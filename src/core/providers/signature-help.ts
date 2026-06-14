import * as vscode from 'vscode';
import { BUILTIN_TAGS } from '../constants';
import { findComponentFile, getCachedProps } from '../scanner';
import type { PropDefinition } from '../models';

export class CottonSignatureHelpProvider implements vscode.SignatureHelpProvider {

    provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.SignatureHelp | undefined {
        const tagInfo = findOpenTag(document, position);
        if (!tagInfo) { return undefined; }

        if (BUILTIN_TAGS.includes(tagInfo.tag)) { return undefined; }

        const filePath = findComponentFile(tagInfo.tag);
        if (!filePath) { return undefined; }

        const props = getCachedProps(filePath).filter(p => !p.hidden);
        if (!props.length) { return undefined; }

        const signature = buildSignature(tagInfo.tag, props);
        const activeParameter = computeActiveParameter(tagInfo.attrsBeforeCursor, props);

        const help = new vscode.SignatureHelp();
        help.signatures = [signature];
        help.activeSignature = 0;
        help.activeParameter = activeParameter;
        return help;
    }
}

interface TagInfo {
    tag: string;
    attrsBeforeCursor: string;
}

function findOpenTag(document: vscode.TextDocument, position: vscode.Position): TagInfo | undefined {
    const fullText = document.getText();
    const cursorOffset = document.offsetAt(position);
    const textBefore = fullText.substring(0, cursorOffset);

    const lastOpen = textBefore.lastIndexOf('<c-');
    if (lastOpen === -1) { return undefined; }

    const between = textBefore.substring(lastOpen);
    if (between.includes('>')) { return undefined; }

    const tagMatch = between.match(/^<c-([\w.-]+)/);
    if (!tagMatch) { return undefined; }

    const attrsBeforeCursor = between.substring(tagMatch[0].length);
    return { tag: tagMatch[1], attrsBeforeCursor };
}

function buildSignature(tag: string, props: PropDefinition[]): vscode.SignatureInformation {
    const parts: string[] = [`<c-${tag}`];
    const paramRanges: [number, number][] = [];

    for (const prop of props) {
        const start = parts.join(' ').length + 1;
        const segment = formatProp(prop);
        parts.push(segment);
        const end = start + segment.length;
        paramRanges.push([start, end]);
    }
    parts.push('/>');

    const label = parts.join(' ');
    const signature = new vscode.SignatureInformation(label);
    signature.parameters = props.map((prop, i) => {
        const param = new vscode.ParameterInformation(paramRanges[i]);
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${prop.cleanName}** — \`${prop.type}\``);
        if (prop.required) { md.appendMarkdown(' · _required_'); }
        if (prop.hasDefault) { md.appendMarkdown(` · default: \`${prop.defaultValue}\``); }
        if (prop.options.length) { md.appendMarkdown(`\n\nOptions: ${prop.options.map(o => `\`${o}\``).join(', ')}`); }
        if (prop.description) { md.appendMarkdown(`\n\n${prop.description}`); }
        param.documentation = md;
        return param;
    });

    const doc = new vscode.MarkdownString();
    doc.appendMarkdown(`**c-${tag}** — ${props.length} prop${props.length === 1 ? '' : 's'}`);
    signature.documentation = doc;
    return signature;
}

function formatProp(prop: PropDefinition): string {
    const prefix = prop.isDynamic ? ':' : '';
    const opt = prop.required ? '' : '?';
    let suffix = '';
    if (prop.hasDefault) {
        suffix = prop.type === 'boolean' || prop.type === 'number'
            ? `=${prop.defaultValue}`
            : `="${prop.defaultValue}"`;
    }
    return `${prefix}${prop.cleanName}${opt}: ${prop.type}${suffix}`;
}

function computeActiveParameter(attrsBeforeCursor: string, props: PropDefinition[]): number {
    const attrRe = /\s*(:?)([\w-]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|\w+))?/g;
    const passed = new Set<string>();
    let match;
    let lastAttrName: string | undefined;
    while ((match = attrRe.exec(attrsBeforeCursor)) !== null) {
        lastAttrName = match[2];
        passed.add(lastAttrName);
    }

    if (lastAttrName) {
        const idx = props.findIndex(p => p.cleanName === lastAttrName);
        if (idx >= 0) { return idx; }
    }

    for (let i = 0; i < props.length; i++) {
        if (!passed.has(props[i].cleanName)) { return i; }
    }
    return 0;
}
