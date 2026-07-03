import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseComponent } from './parser';
import { nameVariations } from './naming';
import { HTML_EXT, HTML_GLOB, DEFAULT_EXCLUDE_SEGMENTS } from './constants';
import { isFileNotFound } from './helpers';
import type { ComponentInfo, CachedComponent, ParsedComponent, PropDefinition } from './models';

interface PropsCacheEntry {
    component: CachedComponent;
    lastStatAt: number;
}

const propsCache = new Map<string, PropsCacheEntry>();
const STAT_CACHE_MS = 100;

function getCached(filePath: string): CachedComponent {
    const now = Date.now();
    const cached = propsCache.get(filePath);

    if (cached && (now - cached.lastStatAt) < STAT_CACHE_MS) {
        return cached.component;
    }

    try {
        const stat = fs.statSync(filePath);
        if (cached && cached.component.mtime === stat.mtimeMs) {
            cached.lastStatAt = now;
            return cached.component;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseComponent(content);
        const component: CachedComponent = {
            ...parsed,
            strict: parsed.isStrict,
            mtime: stat.mtimeMs,
        };
        propsCache.set(filePath, { component, lastStatAt: now });
        return component;
    } catch (err) {
        // Log only the unexpected — a not-found here is the normal delete/rename race.
        if (!isFileNotFound(err)) {
            console.error(`[Cotton] Failed to read component: ${filePath}`, err);
        }
        return EMPTY_CACHED;
    }
}

const EMPTY_CACHED: CachedComponent = {
    props: [],
    description: '',
    slots: [],
    trigger: '',
    cvars: null,
    acceptsAttrs: false,
    isStrict: false,
    ignoreUnused: false,
    strict: false,
    mtime: 0,
};

export function getCachedProps(filePath: string): PropDefinition[] {
    return getCached(filePath).props;
}

export function isStrict(filePath: string): boolean {
    return getCached(filePath).strict;
}

/**
 * Returns the full parsed shape for a component file. Use this when you
 * need slots, trigger, description, cvars, or acceptsAttrs in addition to
 * props — `getCachedProps`/`isStrict` are the legacy single-field accessors.
 */
export function getCachedComponent(filePath: string): ParsedComponent {
    return getCached(filePath);
}

export function getTemplatePaths(): string[] {
    return vscode.workspace.getConfiguration('djangoCottonProps')
        .get<string[]>('templatePaths', ['templates/cotton']);
}

/** Directory segments the user wants excluded from the workspace usage scan. */
export function getExcludePaths(): string[] {
    const configured = vscode.workspace.getConfiguration('djangoCottonProps')
        .get<string[]>('excludePaths', [...DEFAULT_EXCLUDE_SEGMENTS]);
    // Defensive: drop empties so a stray "" can't produce `{,foo}` (matches all).
    const cleaned = configured.map(s => s.trim()).filter(Boolean);
    return cleaned.length ? cleaned : [...DEFAULT_EXCLUDE_SEGMENTS];
}

/** Build a `findFiles` exclude glob from directory segments: `**​/{a,b}/**`. */
export function buildExcludeGlob(segments: string[]): string {
    return `**/{${segments.join(',')}}/**`;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Should a directory be skipped per `excludePaths`? Mirrors the findFiles
 *  exclude glob for the sync walk: a single-segment entry matches by name
 *  (with `*` wildcards, so `.*` skips dot-dirs); a multi-segment entry like
 *  `templates/cotton/icons` matches a path suffix from the workspace root. */
export function isExcludedDir(name: string, relPath: string, segments: string[]): boolean {
    return segments.some(seg => {
        if (seg.includes('/')) {
            return relPath === seg || relPath.endsWith(`/${seg}`);
        }
        if (seg.includes('*')) {
            return new RegExp(`^${seg.split('*').map(escapeRegExp).join('.*')}$`).test(name);
        }
        return name === seg;
    });
}

/** Build the file-watcher glob from template paths. `**​/` prefix lets the
 *  match land at any depth (Django multi-app `myapp/templates/cotton/...`). */
export function buildWatchGlob(paths: string[]): string {
    const globs = paths.map(p => `**/${p}/${HTML_GLOB}`);
    return globs.length === 1 ? globs[0] : `{${globs.join(',')}}`;
}

/** Config-driven exclude glob for every workspace-wide `findFiles` scan. */
export function getWorkspaceExcludeGlob(): string {
    return buildExcludeGlob(getExcludePaths());
}

export function isCottonFile(uri: vscode.Uri): boolean {
    const p = uri.fsPath.replace(/\\/g, '/');
    return getTemplatePaths().some(tpl => p.includes(`/${tpl}/`));
}

let scanCache: ComponentInfo[] | null = null;

/**
 * Sync component scan — kept sync because every provider that calls it
 * (hover, definition, completion, inlay-hints, ...) is itself sync.
 *
 * The cache is invalidated EXPLICITLY (watcher events, config changes), not by
 * a TTL — so a warm cache is always current. `prewarmScanCache()` (the async,
 * multi-app `findFiles` discovery) is fired at activation and after every
 * disk/config change, so the cache is normally hot. This sync branch is only
 * the COLD fallback: an anchored walk of the configured roots. It's fast and
 * synchronous for the common single-root layout; the async prewarm replaces it
 * with the full multi-app set moments later (and refreshes the tree).
 */
export function scanComponents(): ComponentInfo[] {
    if (scanCache) { return scanCache; }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) { return []; }

    const root = folder.uri.fsPath;
    const excludes = getExcludePaths();
    const components: ComponentInfo[] = [];
    for (const tplPath of getTemplatePaths()) {
        walkSync(path.join(root, tplPath), components, root, excludes);
    }
    scanCache = components;
    return components;
}

function walkSync(dir: string, out: ComponentInfo[], root: string, excludes: string[]): void {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (err) {
        // A missing scan root is EXPECTED, not an error: in multi-app layouts the
        // root-level templatePath often doesn't exist — components live under
        // <app>/templates/cotton and are found by the async scan. Log only the rest.
        if (!isFileNotFound(err)) {
            console.error(`[Cotton] Failed to read directory: ${dir}`, err);
        }
        return;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Honour `excludePaths` so this cold sync walk skips the same folders
            // the async findFiles scan does — otherwise an excluded dir (e.g.
            // templates/cotton/icons) would reappear in the tree on cold start.
            const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
            if (isExcludedDir(entry.name, relPath, excludes)) { continue; }
            walkSync(fullPath, out, root, excludes);
        } else if (entry.isFile() && entry.name.endsWith(HTML_EXT)) {
            // Single source of truth for tag derivation — honours the index.html
            // convention and stays in lockstep with the async prewarm scan.
            const tag = filePathToTag(fullPath);
            if (tag) { out.push({ tag, filePath: fullPath }); }
        }
    }
}

/**
 * Async, authoritative component discovery. Uses `findFiles` with the same
 * depth-agnostic glob as the file watcher (built by `buildWatchGlob`), so it
 * discovers components at ANY directory depth — both a single
 * `templates/cotton` at the root AND per-app copies in a Django APP_DIRS
 * layout (`shop/templates/cotton/...`). Honours `excludePaths` so it never
 * walks `.venv`/`node_modules`. Tag names come from the shared `filePathToTag`,
 * which is already relative-to-suffix (multi-app aware).
 *
 * Fired at activation and after every disk/config change so the sync
 * `scanComponents()` cache is normally hot.
 */
export async function prewarmScanCache(): Promise<void> {
    const files = await vscode.workspace.findFiles(
        buildWatchGlob(getTemplatePaths()),
        getWorkspaceExcludeGlob(),
    );
    const components: ComponentInfo[] = [];
    for (const uri of files) {
        const tag = filePathToTag(uri.fsPath);
        if (tag) { components.push({ tag, filePath: uri.fsPath }); }
    }
    scanCache = components;
}

export function invalidateScanCache(): void {
    scanCache = null;
    propsCache.clear();
}

export function filePathToTag(filePath: string): string | undefined {
    const normalized = filePath.replace(/\\/g, '/');
    for (const tplPath of getTemplatePaths()) {
        const marker = `/${tplPath}/`;
        const idx = normalized.indexOf(marker);
        if (idx === -1) { continue; }
        const relative = normalized.substring(idx + marker.length);
        if (!relative.endsWith(HTML_EXT)) { continue; }
        let rel = relative.slice(0, -HTML_EXT.length);
        // Django Cotton's index convention: `card/index.html` is the folder's
        // default component, addressed as <c-card /> — not <c-card.index>. A
        // bare root `index.html` names no folder, so it is not a component.
        if (rel === 'index') { return undefined; }
        if (rel.endsWith('/index')) { rel = rel.slice(0, -'/index'.length); }
        return rel.replace(/\//g, '.');
    }
    return undefined;
}

export function findComponentFile(tag: string): string | undefined {
    const all = scanComponents();
    for (const v of nameVariations(tag)) {
        const found = all.find(c => c.tag === v);
        if (found) { return found.filePath; }
    }
    return undefined;
}
