import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getTemplatePaths } from '../scanner';

const MIN_OCCURRENCES = 3;
const MIN_SNIPPET_LENGTH = 80;
const MAX_RESULTS = 20;

interface PatternMatch {
    hash: string;
    example: string;
    count: number;
    locations: { uri: vscode.Uri; offset: number }[];
}

export async function findExtractablePatterns() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
        vscode.window.showErrorMessage('No workspace open');
        return;
    }

    const progress = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning for repeated patterns…', cancellable: false },
        async () => scanWorkspaceForPatterns(),
    );

    const patterns = progress;
    if (patterns.length === 0) {
        vscode.window.showInformationMessage('No repeated patterns found (minimum 3 occurrences).');
        return;
    }

    const items: vscode.QuickPickItem[] = patterns.slice(0, MAX_RESULTS).map(p => ({
        label: `${p.count}×  ${firstLine(p.example)}`,
        description: `${p.locations.length} locations`,
        detail: truncate(p.example.replace(/\s+/g, ' '), 140),
    }));

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `${patterns.length} repeated patterns found — pick one to inspect`,
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!picked) { return; }

    const idx = items.indexOf(picked);
    const pattern = patterns[idx];
    const first = pattern.locations[0];
    const doc = await vscode.workspace.openTextDocument(first.uri);
    const editor = await vscode.window.showTextDocument(doc);
    const pos = doc.positionAt(first.offset);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos));

    vscode.window.showInformationMessage(
        `Jumped to first occurrence (${pattern.count} total). Select the block and run "Extract to Component".`,
    );
}

async function scanWorkspaceForPatterns(): Promise<PatternMatch[]> {
    const tplPaths = getTemplatePaths();
    const exclude = `{**/node_modules/**,${tplPaths.map(p => `**/${p}/**`).join(',')}}`;

    const files = await vscode.workspace.findFiles('**/*.html', exclude);
    const byHash = new Map<string, PatternMatch>();

    for (const uri of files) {
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const text = doc.getText();
            const snippets = extractSnippets(text);

            for (const { snippet, offset } of snippets) {
                const normalized = normalizeSnippet(snippet);
                if (normalized.length < MIN_SNIPPET_LENGTH) { continue; }
                const hash = hashString(normalized);

                let entry = byHash.get(hash);
                if (!entry) {
                    entry = { hash, example: snippet, count: 0, locations: [] };
                    byHash.set(hash, entry);
                }
                entry.count++;
                entry.locations.push({ uri, offset });
            }
        } catch (err) {
            console.error(`[Cotton] Pattern scan failed for ${uri.fsPath}`, err);
        }
    }

    return Array.from(byHash.values())
        .filter(p => p.count >= MIN_OCCURRENCES)
        .sort((a, b) => b.count - a.count);
}

export function extractSnippets(text: string): { snippet: string; offset: number }[] {
    const results: { snippet: string; offset: number }[] = [];
    const openRe = /<(button|div|section|article|header|footer|nav|form|ul|ol|table|a|span|label|input|textarea|select)\b([^>]*)>/g;
    let match;

    while ((match = openRe.exec(text)) !== null) {
        if (match[2].endsWith('/')) { continue; }
        const tagName = match[1];
        const openEnd = match.index + match[0].length;
        const closeOffset = findMatchingClose(text, openEnd, tagName);
        if (closeOffset === -1) { continue; }

        const fullEnd = closeOffset + `</${tagName}>`.length;
        const snippet = text.substring(match.index, fullEnd);
        results.push({ snippet, offset: match.index });
    }

    return results;
}

function findMatchingClose(text: string, startOffset: number, tagName: string): number {
    const openTag = new RegExp(`<${tagName}\\b[^>]*(?<!/)>`, 'g');
    const closeTag = new RegExp(`</${tagName}\\s*>`, 'g');
    openTag.lastIndex = startOffset;
    closeTag.lastIndex = startOffset;

    let depth = 1;
    let cursor = startOffset;
    const limit = Math.min(text.length, startOffset + 10000);

    while (cursor < limit) {
        openTag.lastIndex = cursor;
        closeTag.lastIndex = cursor;
        const nextOpen = openTag.exec(text);
        const nextClose = closeTag.exec(text);
        if (!nextClose) { return -1; }

        if (nextOpen && nextOpen.index < nextClose.index) {
            depth++;
            cursor = nextOpen.index + nextOpen[0].length;
        } else {
            depth--;
            if (depth === 0) { return nextClose.index; }
            cursor = nextClose.index + nextClose[0].length;
        }
    }
    return -1;
}

export function normalizeSnippet(html: string): string {
    return html
        .replace(/\{\{[^}]*\}\}/g, '{{}}')
        .replace(/\{%[^%]*%\}/g, '{%}')
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .trim();
}

function hashString(s: string): string {
    return crypto.createHash('sha1').update(s).digest('hex');
}

export function firstLine(text: string): string {
    const trimmed = text.trim().split('\n')[0];
    return truncate(trimmed, 80);
}

export function truncate(s: string, n: number): string {
    return s.length <= n ? s : s.substring(0, n - 1) + '…';
}
