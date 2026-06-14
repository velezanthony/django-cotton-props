import * as vscode from 'vscode';
import { BUILTIN_TAGS } from '../constants';
import { cottonTagOpenRe } from '../regex';
import { findComponentFile, getCachedProps } from '../scanner';

const ATTR_RE = /\s(:?)([\w-]+)/g;

export class CottonInlayHintsProvider implements vscode.InlayHintsProvider {

    provideInlayHints(document: vscode.TextDocument, range: vscode.Range): vscode.InlayHint[] {
        const config = vscode.workspace.getConfiguration('djangoCottonProps');
        if (!config.get<boolean>('inlayHints.showDefaults', true)) { return []; }

        const hints: vscode.InlayHint[] = [];
        const fullText = document.getText();
        const startOffset = document.offsetAt(range.start);
        const endOffset = document.offsetAt(range.end);

        const tagRe = cottonTagOpenRe();
        tagRe.lastIndex = startOffset;
        let match;
        while ((match = tagRe.exec(fullText)) !== null) {
            if (match.index > endOffset) { break; }

            const tag = match[1];
            if (BUILTIN_TAGS.includes(tag)) { continue; }

            const attrsStr = match[2];
            const selfClosing = match[3] === '/';

            const filePath = findComponentFile(tag);
            if (!filePath) { continue; }

            const props = getCachedProps(filePath);
            if (!props.length) { continue; }

            const passed = collectPassedAttrs(attrsStr);

            const insertOffset = match.index + `<c-${tag}`.length + attrsStr.length;
            const position = document.positionAt(insertOffset);

            for (const prop of props) {
                if (!prop.hasDefault) { continue; }
                if (prop.hidden) { continue; }
                if (prop.deprecated !== undefined) { continue; }
                if (passed.has(prop.cleanName)) { continue; }

                const label = ` ${prop.cleanName}=${formatDefault(prop)}`;
                const hint = new vscode.InlayHint(position, label, vscode.InlayHintKind.Parameter);
                hint.paddingLeft = !selfClosing;
                hint.tooltip = new vscode.MarkdownString(`Default value for \`${prop.cleanName}\` (type: ${prop.type})`);
                hints.push(hint);
            }
        }

        return hints;
    }
}

function collectPassedAttrs(attrsStr: string): Set<string> {
    const passed = new Set<string>();
    for (const m of attrsStr.matchAll(ATTR_RE)) {
        passed.add(m[2]);
    }
    return passed;
}

function formatDefault(prop: { type: string; defaultValue: string }): string {
    if (prop.type === 'boolean' || prop.type === 'number') {
        return prop.defaultValue;
    }
    return `"${prop.defaultValue}"`;
}
