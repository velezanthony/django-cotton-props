import * as vscode from 'vscode';

const TAG_NAME_RE = /^<c-([\w.-]+)/;

export function findTagContext(document: vscode.TextDocument, offset: number): string | undefined {
    if (offset < 3) { return undefined; }

    const text = document.getText();
    const idx = text.lastIndexOf('<c-', offset - 3);
    if (idx === -1) { return undefined; }

    const gt = text.indexOf('>', idx);
    if (gt !== -1 && gt < offset) { return undefined; }

    const match = text.substring(idx, Math.min(idx + 200, offset)).match(TAG_NAME_RE);
    return match ? match[1] : undefined;
}
