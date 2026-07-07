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
type Component = { tag: string; filePath: string };

/** A node in the component trie. Each tag (`a.b.c`) splits on `.` into a
 *  chain of nodes. A node carries `filePath` when a component lives AT that
 *  path (a leaf, or a folder's `index.html`), and `children` when other
 *  components nest below it. A node can have BOTH — that is the folder that
 *  also is a component (Django Cotton's index.html convention). */
export interface TagTreeNode {
    /** Last path segment (`c` for `a.b.c`). Empty for the synthetic root. */
    segment: string;
    /** Full dotted path from the root (`a.b.c`). Empty for the root. */
    path: string;
    /** Set when a component file lives at this exact path. */
    filePath?: string;
    children: Map<string, TagTreeNode>;
}

/** Build the trie from the flat scan. Folders become intermediate nodes; the
 *  last segment of each tag carries the file. Pure — unit-testable without the
 *  disk scan. */
export function buildTagTree(components: readonly Component[]): TagTreeNode {
    const root: TagTreeNode = { segment: '', path: '', children: new Map() };
    for (const c of components) {
        let node = root;
        let acc = '';
        for (const seg of c.tag.split('.')) {
            acc = acc ? `${acc}.${seg}` : seg;
            let child = node.children.get(seg);
            if (!child) {
                child = { segment: seg, path: acc, children: new Map() };
                node.children.set(seg, child);
            }
            node = child;
        }
        node.filePath = c.filePath;
    }
    return root;
}

/** Flatten every component at or below a node (the node's own file, if any,
 *  plus all descendants). Drives folder-level aggregates and counts. */
function collectComponents(node: TagTreeNode, out: Component[] = []): Component[] {
    if (node.filePath !== undefined) { out.push({ tag: node.path, filePath: node.filePath }); }
    for (const child of node.children.values()) { collectComponents(child, out); }
    return out;
}

/** Last segment of a dotted path — the label shown in the tree row. */
function lastSegment(path: string): string {
    const i = path.lastIndexOf('.');
    return i === -1 ? path : path.substring(i + 1);
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

/** Sum each component's diagnostic counts and unused state into one
 *  folder-level total. Recursive descendants are collected by the caller, so
 *  this stays a flat fold over a precomputed list. */
function aggregateCategory(items: readonly Component[], usageIndex: UsageIndex | undefined): CategoryAggregate {
    const counts: SeverityCounts = { error: 0, warning: 0, info: 0, hint: 0 };
    let unusedCount = 0;
    for (const c of items) {
        const childCounts = countDiagnostics(vscode.Uri.file(c.filePath));
        counts.error   += childCounts.error;
        counts.warning += childCounts.warning;
        counts.info    += childCounts.info;
        counts.hint    += childCounts.hint;
        if (isUnused(c.filePath, c.tag, usageIndex)) { unusedCount++; }
    }
    return { counts, unusedCount };
}

/** A folder with no component of its own (no index.html): a pure grouping
 *  node. Its description rolls up every descendant component. */
class CategoryItem extends vscode.TreeItem {
    constructor(
        public readonly path: string,
        private readonly descendants: readonly Component[],
        private readonly usageIndex: UsageIndex | undefined,
    ) {
        super(lastSegment(path), vscode.TreeItemCollapsibleState.Expanded);
        this.id = path;
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'category';
        this.refreshAggregate();
    }

    /** Recompute the rolled-up folder summary in place. */
    refreshAggregate(): void {
        this.description = buildCategoryDescription(
            this.descendants.length,
            aggregateCategory(this.descendants, this.usageIndex),
        );
    }
}

/** Theme-aware icon: VS Code picks `light` on light themes, `dark` on dark.
 *  A single `currentColor` SVG is unreliable as a tree iconPath (it renders
 *  black on dark themes in some hosts), so we ship two explicit variants. */
type ThemedIcon = { light: vscode.Uri; dark: vscode.Uri };

interface ComponentItemDeps {
    usageIndex?: UsageIndex;
    /** The plugin logo, used as the icon when this component is also a folder. */
    icon?: ThemedIcon;
    /** When set, this component is ALSO a folder (has an index.html + children).
     *  Its row shows the rolled-up folder aggregate instead of its own props. */
    descendants?: readonly Component[];
}

class ComponentItem extends vscode.TreeItem {
    private readonly deps: ComponentItemDeps;
    /** True when this node is both a component and a folder (index.html). */
    readonly isFolder: boolean;

    constructor(
        public readonly tag: string,
        public readonly filePath: string,
        deps: ComponentItemDeps = {},
    ) {
        const isFolder = deps.descendants !== undefined;
        super(
            lastSegment(tag),
            isFolder ? vscode.TreeItemCollapsibleState.Expanded
                     : vscode.TreeItemCollapsibleState.None,
        );
        this.deps = deps;
        this.isFolder = isFolder;
        this.id = tag;

        // Use a custom URI scheme so OUR FileDecorationProvider targets the
        // tree item, plus carry the file path as the path so the provider
        // can resolve diagnostics and unused state from one input.
        this.resourceUri = vscode.Uri.file(filePath).with({ scheme: COTTON_TREE_SCHEME });
        // Folder + component → plugin logo; pure component → layers glyph.
        this.iconPath = isFolder && deps.icon ? deps.icon : new vscode.ThemeIcon('layers');
        this.contextValue = 'component';
        this.command = {
            command: COMMANDS.SELECT_COMPONENT,
            title: 'Select Component',
            arguments: [this],
        };

        this.refreshState();
    }

    /** Path is the dotted tag — a uniform handle across folder/component items. */
    get path(): string { return this.tag; }

    /** Recompute description + tooltip in place against current diagnostics
     *  and usage state. A folder+component shows the rolled-up aggregate (which
     *  already includes its own index.html); a pure component shows its props.
     *  Lets the tree provider do surgical refreshes (`fire(item)`) instead of
     *  rebuilding the whole subtree on every keystroke-driven change. */
    refreshState(): void {
        if (this.isFolder && this.deps.descendants) {
            this.description = buildCategoryDescription(
                this.deps.descendants.length,
                aggregateCategory(this.deps.descendants, this.deps.usageIndex),
            );
        } else {
            const props = getCachedProps(this.filePath);
            const counts = countDiagnostics(vscode.Uri.file(this.filePath));
            const unused = isUnused(this.filePath, this.tag, this.deps.usageIndex);
            this.description = buildDescription(props.length, counts, unused);
        }
        this.tooltip = buildTooltip(this.tag, countDiagnostics(vscode.Uri.file(this.filePath)), isUnused(this.filePath, this.tag, this.deps.usageIndex));
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

/** Case-insensitive substring match of a component tag against the active
 *  filter. The full dotted tag is matched, so both the category segment
 *  (`atoms`) and the name segment (`button`) of `atoms.button` are reachable.
 *  An empty filter matches everything. The filter is expected pre-normalised
 *  (trimmed + lowercased) by the caller — kept pure so it's unit-testable. */
export function matchesFilter(tag: string, filter: string): boolean {
    if (filter === '') { return true; }
    return tag.toLowerCase().includes(filter);
}

export class ComponentTreeProvider implements vscode.TreeDataProvider<TreeItem>, vscode.TreeDragAndDropController<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private _tree: TagTreeNode | null = null;
    /** Cache of items VS Code has already seen, keyed by full path — required
     *  for surgical `fire(item)` refreshes (VS Code only updates items it
     *  issued) and for resolving an element back to its trie node. */
    private _items = new Map<string, TreeItem>();
    private readonly _icon?: ThemedIcon;
    /** Active tag filter, pre-normalised (trimmed + lowercased). Empty = off. */
    private _filter = '';

    // ── Drag and Drop ──
    readonly dropMimeTypes: string[] = [];
    readonly dragMimeTypes: string[] = [COTTON_DRAG_MIME];

    constructor(private usageIndex?: UsageIndex, extensionUri?: vscode.Uri) {
        this._icon = extensionUri
            ? {
                light: vscode.Uri.joinPath(extensionUri, 'media', 'cotton-icon-light.svg'),
                dark: vscode.Uri.joinPath(extensionUri, 'media', 'cotton-icon-dark.svg'),
            }
            : undefined;
    }

    handleDrag(source: readonly TreeItem[], dataTransfer: vscode.DataTransfer): void {
        const components = source.filter((item): item is ComponentItem => item instanceof ComponentItem);
        if (components.length === 0) { return; }

        const tags = components.map(c => c.tag);
        dataTransfer.set(COTTON_DRAG_MIME, new vscode.DataTransferItem(JSON.stringify(tags)));
    }

    handleDrop(): void { /* drops go to editor via DocumentDropEditProvider */ }

    /** Active filter text, so the extension can reflect it in the view header. */
    get filter(): string { return this._filter; }

    /** Set the tag filter and rebuild. A full refresh() is correct here: the
     *  match set changes structurally, so the cached items must be dropped and
     *  re-walked — same path as a file create/delete. Normalises once so the
     *  getter and getChildren() agree on a single canonical form. */
    setFilter(text: string): void {
        this._filter = text.trim().toLowerCase();
        this.refresh();
    }

    /** Full rebuild — use for structural changes (file create/delete/rename)
     *  or explicit user refresh. Throws away the trie and per-item cache so the
     *  next getChildren walk starts fresh. */
    refresh(): void {
        this._tree = null;
        this._items.clear();
        this._onDidChangeTreeData.fire(undefined);
    }

    /** Surgical refresh: re-emit only the items whose displayed state depends
     *  on the given URIs. A keystroke in a usage file produces zero items here;
     *  a keystroke in a component file re-emits that component plus every
     *  ancestor folder (whose aggregate rolls the component up). */
    refreshForUris(uris: readonly vscode.Uri[]): void {
        const affected = new Set<string>();
        for (const uri of uris) {
            const tag = filePathToTag(uri.fsPath);
            if (!tag) { continue; }
            affected.add(tag);
            const segs = tag.split('.');
            for (let i = 1; i < segs.length; i++) {
                affected.add(segs.slice(0, i).join('.'));
            }
        }
        for (const path of affected) {
            const item = this._items.get(path);
            if (!item) { continue; }
            if (item instanceof ComponentItem) { item.refreshState(); }
            else { item.refreshAggregate(); }
            this._onDidChangeTreeData.fire(item);
        }
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): TreeItem[] {
        const node = element ? this.findNode(element.path) : this.ensureTree();
        if (!node) { return []; }
        return this.childrenOf(node);
    }

    private ensureTree(): TagTreeNode {
        // Apply the active filter at the scan boundary: the trie is built only
        // from matching components, so a folder with no surviving child simply
        // doesn't appear. Filtering here cascades through the whole tree, and
        // setFilter()'s refresh() drops _tree so the next walk re-filters.
        if (!this._tree) {
            this._tree = buildTagTree(scanComponents().filter(c => matchesFilter(c.tag, this._filter)));
        }
        return this._tree;
    }

    /** Resolve a dotted path back to its trie node by walking segment by
     *  segment from the root. */
    private findNode(path: string): TagTreeNode | undefined {
        let node = this.ensureTree();
        for (const seg of path.split('.')) {
            const next = node.children.get(seg);
            if (!next) { return undefined; }
            node = next;
        }
        return node;
    }

    /** Map a node's children to tree items: folders first, then components,
     *  alphabetical within each group. Items are cached by path so surgical
     *  refresh can target the same instance VS Code already holds. */
    private childrenOf(node: TagTreeNode): TreeItem[] {
        const entries = Array.from(node.children.values()).sort((a, b) => {
            const aFolder = a.children.size > 0;
            const bFolder = b.children.size > 0;
            if (aFolder !== bFolder) { return aFolder ? -1 : 1; }
            return a.segment.localeCompare(b.segment);
        });
        return entries.map(child => this.makeItem(child));
    }

    private makeItem(node: TagTreeNode): TreeItem {
        const cached = this._items.get(node.path);
        if (cached) { return cached; }

        const isFolder = node.children.size > 0;
        let item: TreeItem;
        if (node.filePath !== undefined) {
            // Component — and also a folder when it has children (index.html).
            item = new ComponentItem(node.path, node.filePath, {
                usageIndex: this.usageIndex,
                icon: this._icon,
                descendants: isFolder ? collectComponents(node) : undefined,
            });
        } else {
            // Pure folder.
            item = new CategoryItem(node.path, collectComponents(node), this.usageIndex);
        }
        this._items.set(node.path, item);
        return item;
    }
}

export { ComponentItem };
// Re-exports for back-compat. Importers should switch to './tree-shared',
// './tree-decorations', and './tree-drop-edit' directly.
export { SeverityCounts } from './tree-shared';
