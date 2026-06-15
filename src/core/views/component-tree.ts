import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { filePathToTag, getCachedProps, scanComponents } from '../scanner';
import type { UsageIndex } from '../usage-index';
import {
    COTTON_TREE_SCHEME,
    countDiagnostics,
    isUnused,
    type SeverityCounts,
} from './tree-shared';
import { COTTON_DRAG_MIME } from './tree-drop-edit';

type TreeItem = CategoryItem | ComponentItem;

class CategoryItem extends vscode.TreeItem {
    constructor(
        public readonly category: string,
        public readonly count: number,
        aggregate: CategoryAggregate,
    ) {
        super(category, vscode.TreeItemCollapsibleState.Expanded);
        this.description = buildCategoryDescription(count, aggregate);
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'category';
    }

    /** Recompute aggregate description in place. The tree provider calls
     *  this when a child component's diagnostics change so the folder
     *  summary updates without rebuilding the whole tree. */
    refreshAggregate(items: { tag: string; filePath: string }[], usageIndex: UsageIndex | undefined): void {
        this.description = buildCategoryDescription(this.count, aggregateCategory(items, usageIndex));
    }
}

export interface CategoryAggregate {
    counts: SeverityCounts;
    unusedCount: number;
}

/** Folder-level summary: `59 · 4E 2W 8H · 12 unused`. The category count
 *  always comes first; severity and unused tags only show when non-zero. */
export function buildCategoryDescription(count: number, agg: CategoryAggregate): string {
    const parts: string[] = [`${count}`];
    const sev: string[] = [];
    if (agg.counts.error > 0)   { sev.push(`${agg.counts.error}E`); }
    if (agg.counts.warning > 0) { sev.push(`${agg.counts.warning}W`); }
    if (agg.counts.hint > 0)    { sev.push(`${agg.counts.hint}H`); }
    if (agg.counts.info > 0)    { sev.push(`${agg.counts.info}I`); }
    if (sev.length > 0) { parts.push(sev.join(' ')); }
    if (agg.unusedCount > 0) { parts.push(`${agg.unusedCount} unused`); }
    return parts.join(' · ');
}

interface ComponentItemDeps {
    usageIndex?: UsageIndex;
}

class ComponentItem extends vscode.TreeItem {
    private readonly deps: ComponentItemDeps;

    constructor(
        public readonly tag: string,
        public readonly category: string,
        public readonly filePath: string,
        deps: ComponentItemDeps = {},
    ) {
        const name = tag.includes('.') ? tag.substring(tag.indexOf('.') + 1) : tag;
        super(name, vscode.TreeItemCollapsibleState.None);
        this.deps = deps;

        // Use a custom URI scheme so OUR FileDecorationProvider targets the
        // tree item, plus carry the file path as the path so the provider
        // can resolve diagnostics and unused state from one input.
        this.resourceUri = vscode.Uri.file(filePath).with({ scheme: COTTON_TREE_SCHEME });
        this.iconPath = new vscode.ThemeIcon('layers');
        this.contextValue = 'component';
        this.command = {
            command: COMMANDS.SELECT_COMPONENT,
            title: 'Select Component',
            arguments: [this],
        };

        this.refreshState();
    }

    /** Recompute description + tooltip in place against current diagnostics
     *  and usage state. Lets the tree provider do surgical refreshes
     *  (`fire(item)`) instead of rebuilding the whole subtree on every
     *  keystroke-driven diagnostic change. */
    refreshState(): void {
        const props = getCachedProps(this.filePath);
        const fileUri = vscode.Uri.file(this.filePath);
        const counts = countDiagnostics(fileUri);
        const unused = isUnused(this.filePath, this.tag, this.deps.usageIndex);
        this.description = buildDescription(props.length, counts, unused);
        this.tooltip = buildTooltip(this.tag, counts, unused);
    }
}

export function buildDescription(propCount: number, counts: SeverityCounts, unused: boolean): string {
    const parts: string[] = [];
    if (propCount > 0) { parts.push(`${propCount} props`); }
    const sev: string[] = [];
    if (counts.error > 0)   { sev.push(`${counts.error}E`); }
    if (counts.warning > 0) { sev.push(`${counts.warning}W`); }
    if (counts.hint > 0)    { sev.push(`${counts.hint}H`); }
    if (counts.info > 0)    { sev.push(`${counts.info}I`); }
    if (sev.length > 0) { parts.push(sev.join(' ')); }
    if (unused) { parts.push('unused'); }
    return parts.join(' · ');
}

function buildTooltip(tag: string, counts: SeverityCounts, unused: boolean): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**c-${tag}**\n\n`);
    if (counts.error > 0)   { md.appendMarkdown(`- ${counts.error} error${counts.error === 1 ? '' : 's'}\n`); }
    if (counts.warning > 0) { md.appendMarkdown(`- ${counts.warning} warning${counts.warning === 1 ? '' : 's'}\n`); }
    if (counts.hint > 0)    { md.appendMarkdown(`- ${counts.hint} hint${counts.hint === 1 ? '' : 's'}\n`); }
    if (counts.info > 0)    { md.appendMarkdown(`- ${counts.info} info${counts.info === 1 ? '' : 's'}\n`); }
    if (unused)             { md.appendMarkdown('- Not referenced anywhere — add `{# @ignore-unused #}` to suppress.\n'); }
    return md;
}

/** Sum each child's diagnostic counts and unused state into one folder-level
 *  total. Iterates the cached component list — same data source as the
 *  ComponentItem children — so the folder and its children stay in sync. */
function aggregateCategory(
    items: { tag: string; filePath: string }[],
    usageIndex: UsageIndex | undefined,
): CategoryAggregate {
    const counts: SeverityCounts = { error: 0, warning: 0, info: 0, hint: 0 };
    let unusedCount = 0;
    for (const c of items) {
        const fileUri = vscode.Uri.file(c.filePath);
        const childCounts = countDiagnostics(fileUri);
        counts.error   += childCounts.error;
        counts.warning += childCounts.warning;
        counts.info    += childCounts.info;
        counts.hint    += childCounts.hint;
        if (isUnused(c.filePath, c.tag, usageIndex)) { unusedCount++; }
    }
    return { counts, unusedCount };
}

export class ComponentTreeProvider implements vscode.TreeDataProvider<TreeItem>, vscode.TreeDragAndDropController<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private _groups = new Map<string, { tag: string; filePath: string }[]>();
    /** Cache of items VS Code has already seen — required for surgical
     *  `fire(item)` refreshes (VS Code only updates items it issued). */
    private _categoryItems = new Map<string, CategoryItem>();
    private _componentItems = new Map<string, ComponentItem>();

    // ── Drag and Drop ──
    readonly dropMimeTypes: string[] = [];
    readonly dragMimeTypes: string[] = [COTTON_DRAG_MIME];

    constructor(private usageIndex?: UsageIndex) {}

    handleDrag(source: readonly TreeItem[], dataTransfer: vscode.DataTransfer): void {
        const components = source.filter((item): item is ComponentItem => item instanceof ComponentItem);
        if (components.length === 0) { return; }

        const tags = components.map(c => c.tag);
        dataTransfer.set(COTTON_DRAG_MIME, new vscode.DataTransferItem(JSON.stringify(tags)));
    }

    handleDrop(): void { /* drops go to editor via DocumentDropEditProvider */ }

    /** Full rebuild — use for structural changes (file create/delete/rename)
     *  or explicit user refresh. Throws away the per-item cache so the next
     *  getChildren walk starts fresh. */
    refresh(): void {
        this._groups.clear();
        this._categoryItems.clear();
        this._componentItems.clear();
        this._onDidChangeTreeData.fire(undefined);
    }

    /** Surgical refresh: only re-emit the items whose displayed state depends
     *  on the given URIs. A keystroke in a usage file (`pages/foo.html`)
     *  produces zero items here; a keystroke in a component file produces
     *  exactly one ComponentItem + its parent CategoryItem. */
    refreshForUris(uris: readonly vscode.Uri[]): void {
        const affectedCategories = new Set<string>();
        for (const uri of uris) {
            const tag = filePathToTag(uri.fsPath);
            if (!tag) { continue; }
            const item = this._componentItems.get(tag);
            if (!item) { continue; }
            item.refreshState();
            this._onDidChangeTreeData.fire(item);
            affectedCategories.add(item.category);
        }
        for (const category of affectedCategories) {
            const catItem = this._categoryItems.get(category);
            const items = this._groups.get(category);
            if (!catItem || !items) { continue; }
            catItem.refreshAggregate(items, this.usageIndex);
            this._onDidChangeTreeData.fire(catItem);
        }
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): TreeItem[] {
        if (!element) {
            const components = scanComponents();
            this._groups.clear();
            this._categoryItems.clear();

            for (const c of components) {
                const category = c.tag.includes('.') ? c.tag.substring(0, c.tag.indexOf('.')) : '_root';
                if (!this._groups.has(category)) { this._groups.set(category, []); }
                this._groups.get(category)!.push(c);
            }

            const sortedCategories = Array.from(this._groups.entries())
                .sort(([a], [b]) => a.localeCompare(b));
            return sortedCategories.map(([category, items]) => {
                const catItem = new CategoryItem(
                    category,
                    items.length,
                    aggregateCategory(items, this.usageIndex),
                );
                this._categoryItems.set(category, catItem);
                return catItem;
            });
        }

        if (element instanceof CategoryItem) {
            const items = this._groups.get(element.category) ?? [];
            return items
                .sort((a, b) => a.tag.localeCompare(b.tag))
                .map(c => {
                    // Reuse cached items so surgical refresh() can target
                    // the same instance VS Code already holds.
                    let item = this._componentItems.get(c.tag);
                    if (!item) {
                        item = new ComponentItem(c.tag, element.category, c.filePath, { usageIndex: this.usageIndex });
                        this._componentItems.set(c.tag, item);
                    }
                    return item;
                });
        }

        return [];
    }
}

export { ComponentItem };
// Re-exports for back-compat. Importers should switch to './tree-shared',
// './tree-decorations', and './tree-drop-edit' directly.
export { SeverityCounts } from './tree-shared';
