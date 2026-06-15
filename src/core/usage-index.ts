import * as vscode from 'vscode';
import { BUILTIN, HTML_GLOB } from './constants';
import { findIsAttribute, parseIsAttribute } from './dynamic-component';
import { cottonTagOpenRe } from './regex';
import { getWorkspaceExcludeGlob } from './scanner';

interface ComponentUsage {
    total: number;
    files: Map<string, number>; // filePath → count in that file
}

export class UsageIndex {
    /** Direct uses: `<c-icons.spinner>` and `<c-component is="icons.spinner">` both land here. */
    private index = new Map<string, ComponentUsage>();
    /** Prefix uses: `<c-component is="icons.{{ name }}">` records under prefix `icons.`. */
    private prefixIndex = new Map<string, ComponentUsage>();
    private _ready: Promise<void>;

    constructor() {
        // Attach a catch handler so a thrown error in fullScan() doesn't
        // turn into an unhandledRejection. fullScan already swallows per-file
        // I/O errors via try/catch — this guards against an outer throw we
        // didn't anticipate (an API rename, a workspace folder going away
        // mid-scan, etc.).
        this._ready = this.fullScan().catch(err => {
            console.error('[Cotton] UsageIndex fullScan failed', err);
        });
    }

    /** Wait for initial scan to complete */
    get ready(): Promise<void> { return this._ready; }

    /** Get usage count for a tag — instant O(prefixes). Counts direct uses plus any
     *  prefix-matching dynamic dispatch (e.g. `icons.{{ name }}` covers `icons.spinner`). */
    getUsage(tag: string): { total: number; fileCount: number } {
        let total = 0;
        const fileSet = new Set<string>();
        const direct = this.index.get(tag);
        if (direct) {
            total += direct.total;
            for (const f of direct.files.keys()) { fileSet.add(f); }
        }
        for (const [prefix, usage] of this.prefixIndex) {
            if (!tag.startsWith(prefix)) { continue; }
            total += usage.total;
            for (const f of usage.files.keys()) { fileSet.add(f); }
        }
        return { total, fileCount: fileSet.size };
    }

    /** Get detailed usage: file paths + count per file (direct + prefix matches merged) */
    getUsageDetail(tag: string): { total: number; files: { path: string; count: number }[] } {
        const byFile = new Map<string, number>();
        const direct = this.index.get(tag);
        if (direct) {
            for (const [filePath, count] of direct.files) {
                byFile.set(filePath, (byFile.get(filePath) ?? 0) + count);
            }
        }
        for (const [prefix, usage] of this.prefixIndex) {
            if (!tag.startsWith(prefix)) { continue; }
            for (const [filePath, count] of usage.files) {
                byFile.set(filePath, (byFile.get(filePath) ?? 0) + count);
            }
        }
        let total = 0;
        const files = Array.from(byFile.entries()).map(([filePath, count]) => {
            total += count;
            return { path: vscode.workspace.asRelativePath(filePath), count };
        });
        return { total, files };
    }

    /** Get raw file paths that contain a tag — for targeted search (direct + prefix). */
    getFilePaths(tag: string): string[] {
        const files = new Set<string>();
        const direct = this.index.get(tag);
        if (direct) {
            for (const f of direct.files.keys()) { files.add(f); }
        }
        for (const [prefix, usage] of this.prefixIndex) {
            if (!tag.startsWith(prefix)) { continue; }
            for (const f of usage.files.keys()) { files.add(f); }
        }
        return Array.from(files);
    }

    /** Re-index a single file (on save/change) */
    updateFile(uri: vscode.Uri, text: string): void {
        const filePath = uri.fsPath;

        this.clearFile(filePath);

        const tagCounts = new Map<string, number>();
        const prefixCounts = new Map<string, number>();

        // Opening tags only — captures tag name and the attribute string (no closing tags).
        const tagRe = cottonTagOpenRe();
        let match;
        while ((match = tagRe.exec(text)) !== null) {
            const tag = match[1];
            const attrs = match[2] ?? '';

            if (tag === BUILTIN.COMPONENT) {
                this.recordDispatch(attrs, tagCounts, prefixCounts);
                continue;
            }

            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }

        for (const [tag, count] of tagCounts) {
            this.add(this.index, tag, filePath, count);
        }
        for (const [prefix, count] of prefixCounts) {
            this.add(this.prefixIndex, prefix, filePath, count);
        }
    }

    private recordDispatch(
        attrs: string,
        tagCounts: Map<string, number>,
        prefixCounts: Map<string, number>,
    ): void {
        const isAttr = findIsAttribute(attrs);
        if (!isAttr) { return; }
        const parsed = parseIsAttribute(isAttr.raw, isAttr.isExpression);
        if (parsed.kind === 'literal') {
            tagCounts.set(parsed.target, (tagCounts.get(parsed.target) ?? 0) + 1);
        } else if (parsed.kind === 'prefix') {
            prefixCounts.set(parsed.prefix, (prefixCounts.get(parsed.prefix) ?? 0) + 1);
        }
        // dynamic → unresolvable, intentionally unrecorded.
    }

    private add(
        store: Map<string, ComponentUsage>,
        key: string,
        filePath: string,
        count: number,
    ): void {
        let usage = store.get(key);
        if (!usage) {
            usage = { total: 0, files: new Map() };
            store.set(key, usage);
        }
        usage.files.set(filePath, count);
        usage.total += count;
    }

    private clearFile(filePath: string): void {
        for (const store of [this.index, this.prefixIndex]) {
            for (const [key, usage] of store) {
                const oldCount = usage.files.get(filePath);
                if (!oldCount) { continue; }
                usage.total -= oldCount;
                usage.files.delete(filePath);
                if (usage.total <= 0) { store.delete(key); }
            }
        }
    }

    /** Remove a file from the index (on delete) */
    removeFile(uri: vscode.Uri): void {
        this.clearFile(uri.fsPath);
    }

    /**
     * Full scan — runs once on activation. Excludes junk dirs; relies on VS
     * Code defaults + common build dirs.
     *
     * Files are opened in parallel batches via `openTextDocument` instead of
     * the previous serial loop. We deliberately keep `openTextDocument`
     * (not raw `fs.readFile`) so VS Code's text-model cache picks up every
     * template — that's what allows other providers (symbols, definition,
     * references) to answer queries against templates the user hasn't
     * explicitly opened yet. The win here is concurrency, not the read API.
     *
     * BATCH bounds memory + open-fd pressure on huge workspaces; libuv's
     * thread pool handles intra-batch parallelism.
     */
    /** Clear and rebuild the whole index from disk — used when `templatePaths`
     *  or `excludePaths` change, so the index reflects the new scan scope
     *  without a window reload. */
    async rescan(): Promise<void> {
        this.index.clear();
        this.prefixIndex.clear();
        await this.fullScan();
    }

    private async fullScan(): Promise<void> {
        const files = await vscode.workspace.findFiles(HTML_GLOB, getWorkspaceExcludeGlob());
        const BATCH = 50;
        for (let i = 0; i < files.length; i += BATCH) {
            const chunk = files.slice(i, i + BATCH);
            await Promise.all(chunk.map(async file => {
                try {
                    const doc = await vscode.workspace.openTextDocument(file);
                    this.updateFile(file, doc.getText());
                } catch (err) {
                    console.error(`[Cotton] Failed to index file: ${file.fsPath}`, err);
                }
            }));
        }
    }
}
