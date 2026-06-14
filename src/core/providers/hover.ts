import * as vscode from 'vscode';
import { COTTON_TAG_RE } from '../constants';
import { findComponentFile, getCachedComponent, getCachedProps } from '../scanner';
import { formatPropSummary, formatPropDocs } from '../formatting';
import { findTagContext } from '../helpers';
import { findIsAttributes } from './is-context';
import type { ParsedComponent } from '../models';

/**
 * Pure render function — builds the MarkdownString shown when hovering a
 * `<c-tag>`. Exported so unit tests can exercise the description / slots /
 * trigger sections without spinning up a workspace.
 */
export function buildTagHoverMarkdown(tag: string, parsed: ParsedComponent): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**c-${tag}**`);
    if (parsed.isStrict) { md.appendMarkdown(' · *@strict*'); }
    md.appendMarkdown('\n\n');

    if (parsed.description) {
        md.appendMarkdown(`_${parsed.description}_\n\n`);
    }

    if (parsed.props.length === 0 && parsed.slots.length === 0 && !parsed.trigger && !parsed.description) {
        md.appendMarkdown('*no props or slots defined*');
        return md;
    }

    if (parsed.props.length > 0) {
        md.appendMarkdown('---\n\n**Props**\n\n');
        md.appendMarkdown(parsed.props.map(p => formatPropSummary(p)).join('\n\n'));
        md.appendMarkdown('\n\n');
    }

    if (parsed.slots.length > 0) {
        md.appendMarkdown('---\n\n**Slots**\n\n');
        for (const slot of parsed.slots) {
            const name = slot.name ? `\`:${slot.name}\`` : '*default*';
            const desc = slot.description ? ` — ${slot.description}` : '';
            md.appendMarkdown(`- ${name}${desc}\n`);
        }
        md.appendMarkdown('\n');
    }

    if (parsed.trigger) {
        md.appendMarkdown(`---\n\n**Trigger**\n\n\`${parsed.trigger}\`\n`);
    }

    return md;
}

const ATTR_RE = /\s:?([\w-]+)(?:=["'][^"']*["'])?/g;

export class HoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
        const line = document.lineAt(position.line).text;
        const char = position.character;

        for (const tagMatch of line.matchAll(COTTON_TAG_RE)) {
            if (char >= tagMatch.index! && char <= tagMatch.index! + tagMatch[0].length) {
                return this.hoverTag(tagMatch[1]);
            }
        }

        // `<c-component is="literal-target">` — hover the resolved target.
        // Scan the whole document so multi-line tag declarations are covered.
        const offset = document.offsetAt(position);
        for (const ctx of findIsAttributes(document.getText())) {
            if (offset < ctx.valueStart || offset > ctx.valueEnd) { continue; }
            if (ctx.expression || ctx.hasInterpolation) { return undefined; }
            return this.hoverTag(ctx.value);
        }

        for (const attrMatch of line.matchAll(ATTR_RE)) {
            const nameStart = attrMatch.index! + attrMatch[0].indexOf(attrMatch[1]);
            const nameEnd = nameStart + attrMatch[1].length;
            if (char >= nameStart && char <= nameEnd) {
                const docOffset = document.offsetAt(position);
                const tag = findTagContext(document, docOffset);
                if (!tag) { continue; }
                return this.hoverProp(tag, attrMatch[1]);
            }
        }

        return undefined;
    }

    private hoverTag(tag: string): vscode.Hover | undefined {
        const filePath = findComponentFile(tag);
        if (!filePath) { return undefined; }
        return new vscode.Hover(buildTagHoverMarkdown(tag, getCachedComponent(filePath)));
    }

    private hoverProp(tag: string, attrName: string): vscode.Hover | undefined {
        const filePath = findComponentFile(tag);
        if (!filePath) { return undefined; }

        const props = getCachedProps(filePath);
        const prop = props.find(p => p.cleanName === attrName);
        if (!prop) { return undefined; }

        const docs = formatPropDocs(prop);
        docs.appendMarkdown(`\n\n*Component: c-${tag}*`);
        return new vscode.Hover(docs);
    }
}
