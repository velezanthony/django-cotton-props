import * as vscode from 'vscode';
import { scanComponents, invalidateScanCache, prewarmScanCache, getTemplatePaths, buildWatchGlob } from './core/scanner';
import { COMMANDS, EXTENSION_NAME, SUPPORTED_LANGUAGES } from './core/constants';
import { shouldRetriggerTagCompletion } from './core/helpers/retrigger';
import { isFileNotFound } from './core/helpers';
import {
    TagCompletionProvider,
    IsValueCompletionProvider,
    PropCompletionProvider,
    ValueCompletionProvider,
    AnnotationCompletionProvider,
    HoverProvider,
    DefinitionProvider,
    CottonSymbolProvider,
    DiagnosticProvider,
    CottonQuickFixProvider,
    CottonRefactorProvider,
    CottonReferenceProvider,
    CottonRenameProvider,
    CottonSemanticTokenProvider,
    SEMANTIC_LEGEND,
    createAutoRenameTag,
    CottonFoldingProvider,
    CottonInlayHintsProvider,
    CottonSignatureHelpProvider,
    CottonCodeLensProvider,
    createDynamicAttrDecorator,
} from './core/providers';
import { ComponentTreeProvider, CottonTreeDecorationProvider, ComponentDetailProvider, ComponentItem, CottonDropEditProvider, COTTON_DRAG_MIME } from './core/views';
import { createRenameHandler, createDeleteHandler } from './core/rename-handler';
import { wrapWithComponent, extractComponent, findExtractablePatterns } from './core/commands';
import { UsageIndex } from './core/usage-index';

const DIAGNOSTIC_DEBOUNCE_MS = 300;

export function activate(context: vscode.ExtensionContext) {
    const selector: vscode.DocumentSelector = [...SUPPORTED_LANGUAGES];
    const diagnostics = vscode.languages.createDiagnosticCollection('cotton');

    // ── Usage index (created early — needed by references provider) ──
    const usageIndex = new UsageIndex();
    const codeLensProvider = new CottonCodeLensProvider(usageIndex);

    // ── Language-feature providers ──
    registerLanguageFeatures(context, selector, usageIndex, codeLensProvider, diagnostics);

    // ── Sidebar: Component Tree ──
    const treeProvider = new ComponentTreeProvider(usageIndex);
    const treeView = vscode.window.createTreeView('cottonComponentsTree', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
        dragAndDropController: treeProvider,
    });

    // Per-component badges (errors / warnings / hints / unused) on the tree.
    const treeDecorations = new CottonTreeDecorationProvider(usageIndex);
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(treeDecorations),
        vscode.languages.onDidChangeDiagnostics(e => {
            // Surgical refresh: skip URIs the tree doesn't care about (usage
            // files, non-cotton HTML, etc.) and target only the component
            // items whose state actually depends on the changed URIs. A
            // keystroke in a usage file is now a no-op for the tree.
            treeProvider.refreshForUris(e.uris);
            treeDecorations.refreshUris(e.uris);
        }),
    );

    // ── Sidebar: Component Detail ──
    const detailProvider = new ComponentDetailProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('cottonComponentDetail', detailProvider),
    );

    // ── Commands ──
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.REFRESH_TREE, async () => {
            // A real hard refresh: drop the cache and re-scan disk (honouring the
            // current templatePaths / excludePaths), then refresh the views — not
            // just a re-render of the stale cache.
            invalidateScanCache();
            await prewarmScanCache();
            await usageIndex.rescan();
            refreshDerivedViews();
        }),
        vscode.commands.registerCommand(COMMANDS.OPEN_COMPONENT, (item: ComponentItem) => {
            vscode.window.showTextDocument(vscode.Uri.file(item.filePath));
        }),
        vscode.commands.registerCommand(COMMANDS.COPY_TAG, (item: ComponentItem) => {
            const tag = `<c-${item.tag}></c-${item.tag}>`;
            vscode.env.clipboard.writeText(tag);
            vscode.window.showInformationMessage(`Copied: ${tag}`);
        }),
        vscode.commands.registerCommand(COMMANDS.SELECT_COMPONENT, (item: ComponentItem) => {
            detailProvider.toggle(item.tag, item.filePath);
        }),
        vscode.commands.registerCommand(COMMANDS.WRAP_WITH_COMPONENT, wrapWithComponent),
        vscode.commands.registerCommand(COMMANDS.EXTRACT_COMPONENT, extractComponent),
        vscode.commands.registerCommand(COMMANDS.FIND_EXTRACTABLE_PATTERNS, findExtractablePatterns),
    );

    // ── Diagnostics (debounced on keystroke, immediate on open/save) ──
    const diagProvider = new DiagnosticProvider(diagnostics, usageIndex);
    registerDiagnosticListeners(context, diagProvider);

    // ── Status bar ──
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'workbench.view.extension.cotton-explorer';
    function updateStatusBar(): void {
        const count = scanComponents().length;
        if (count > 0) {
            statusBar.text = `$(symbol-class) ${count} ${EXTENSION_NAME}`;
            statusBar.tooltip = `Click to open ${EXTENSION_NAME}`;
            statusBar.show();
        } else {
            statusBar.hide();
        }
    }
    updateStatusBar();

    // Single source of truth for the views derived from the component model
    // (scanner) and the usage index. Every on-disk / config change funnels
    // through here so the tree, status bar, and CodeLens cannot drift out of
    // sync — these three calls were previously copy-pasted at five sites, and
    // one of them (post-rename) had silently dropped the CodeLens refresh.
    function refreshDerivedViews(): void {
        treeProvider.refresh();
        updateStatusBar();
        codeLensProvider.refresh();
    }

    // ── Usage index: incremental updates on save ──
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(d => {
            usageIndex.updateFile(d.uri, d.getText());
            codeLensProvider.refresh();
        }),
    );

    // ── Auto-rename: update all <c-tag> references when a component file is renamed/moved ──
    context.subscriptions.push(
        createRenameHandler(usageIndex),
        ...createDeleteHandler(usageIndex),
        vscode.workspace.onDidRenameFiles(() => {
            // Force re-validate all open documents after rename completes
            vscode.workspace.textDocuments.forEach(d => diagProvider.update(d));
            refreshDerivedViews();
        }),
    );

    // ── File watcher: refresh tree + status bar on changes ──
    async function reindexOnDisk(uri: vscode.Uri): Promise<void> {
        invalidateScanCache();
        // Warm the scan cache async so the next sync scanComponents() call
        // (typically inside treeProvider.refresh below) returns from cache
        // instead of doing a sync directory walk on the typing hot path.
        await prewarmScanCache();
        try {
            // Read from disk via fs.readFile: the watcher reports disk (not unsaved
            // buffers), and fs.readFile surfaces a proper FileNotFound code —
            // openTextDocument's error is codeless and can't be told apart.
            const bytes = await vscode.workspace.fs.readFile(uri);
            usageIndex.updateFile(uri, new TextDecoder().decode(bytes));
        } catch (err) {
            // Log only the unexpected — a file deleted mid-event is the normal race.
            if (!isFileNotFound(err)) {
                console.error(`[Cotton] Failed to reindex file: ${uri.fsPath}`, err);
            }
        }
        refreshDerivedViews();
    }
    async function deindexOnDisk(uri: vscode.Uri): Promise<void> {
        invalidateScanCache();
        await prewarmScanCache();
        usageIndex.removeFile(uri);
        refreshDerivedViews();
    }

    // The watcher glob depends on `templatePaths`, so it must be rebuilt when
    // that setting changes — otherwise it keeps watching the old location.
    let watcher: vscode.FileSystemWatcher | undefined;
    const watcherHandlers: vscode.Disposable[] = [];
    function setupWatcher(): void {
        watcher?.dispose();
        watcherHandlers.forEach(d => d.dispose());
        watcherHandlers.length = 0;
        watcher = vscode.workspace.createFileSystemWatcher(buildWatchGlob(getTemplatePaths()));
        watcherHandlers.push(
            watcher.onDidCreate(reindexOnDisk),
            watcher.onDidChange(reindexOnDisk),
            watcher.onDidDelete(deindexOnDisk),
        );
    }
    setupWatcher();

    // Warm the multi-app component cache on activation so the tree, status bar,
    // and providers reflect every app's components — not just the cold
    // root-anchored fallback. Refresh once the async findFiles discovery lands.
    void prewarmScanCache().then(() => {
        refreshDerivedViews();
    });

    // Apply `templatePaths` / `excludePaths` changes live — no window reload.
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async e => {
            const tplChanged = e.affectsConfiguration('djangoCottonProps.templatePaths');
            const excChanged = e.affectsConfiguration('djangoCottonProps.excludePaths');
            const sevChanged = e.affectsConfiguration('djangoCottonProps.diagnostics.missingDescription.severity');
            if (!tplChanged && !excChanged && !sevChanged) { return; }
            // The watcher glob is built from templatePaths, so only that needs it rebuilt.
            if (tplChanged) { setupWatcher(); }
            // Both settings change the scan SCOPE (definitions feed the tree), so
            // either must rebuild the scan cache — not just the usage index.
            // Without this, an excluded folder stayed stale in the tree.
            if (tplChanged || excChanged) {
                invalidateScanCache();
                await prewarmScanCache();
            }
            // excludePaths also narrows where component USAGES are scanned.
            if (excChanged) {
                await usageIndex.rescan();
            }
            // Re-validate open docs when anything diagnostics depend on changed:
            // the scan scope (which tags are known) or the severity knob itself.
            if (tplChanged || excChanged || sevChanged) {
                vscode.workspace.textDocuments.forEach(d => diagProvider.update(d));
            }
            refreshDerivedViews();
        }),
    );

    context.subscriptions.push(statusBar, treeView, {
        dispose: () => {
            watcher?.dispose();
            watcherHandlers.forEach(d => d.dispose());
        },
    });
}

export function deactivate() {}

/** Register every language-feature provider against the Cotton document
 *  selector. Pure wiring, extracted so activate() reads as a sequence of
 *  named setup steps instead of one long registration wall. */
function registerLanguageFeatures(
    context: vscode.ExtensionContext,
    selector: vscode.DocumentSelector,
    usageIndex: UsageIndex,
    codeLensProvider: CottonCodeLensProvider,
    diagnostics: vscode.DiagnosticCollection,
): void {
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(selector, new TagCompletionProvider(), '<'),
        vscode.languages.registerCompletionItemProvider(selector, new IsValueCompletionProvider(), '"', "'", '.'),
        vscode.languages.registerCompletionItemProvider(selector, new PropCompletionProvider(), ' ', ':'),
        vscode.languages.registerCompletionItemProvider(selector, new ValueCompletionProvider(), '"', "'"),
        vscode.languages.registerCompletionItemProvider(selector, new AnnotationCompletionProvider(), '@', ':'),
        vscode.languages.registerHoverProvider(selector, new HoverProvider()),
        vscode.languages.registerDefinitionProvider(selector, new DefinitionProvider()),
        vscode.languages.registerDocumentSymbolProvider(selector, new CottonSymbolProvider()),
        vscode.languages.registerCodeActionsProvider(selector, new CottonQuickFixProvider(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
        vscode.languages.registerCodeActionsProvider(selector, new CottonRefactorProvider(), { providedCodeActionKinds: CottonRefactorProvider.providedKinds }),
        vscode.languages.registerReferenceProvider(selector, new CottonReferenceProvider(usageIndex)),
        vscode.languages.registerRenameProvider(selector, new CottonRenameProvider(usageIndex)),
        vscode.languages.registerDocumentSemanticTokensProvider(selector, new CottonSemanticTokenProvider(), SEMANTIC_LEGEND),
        vscode.languages.registerFoldingRangeProvider(selector, new CottonFoldingProvider()),
        vscode.languages.registerInlayHintsProvider(selector, new CottonInlayHintsProvider()),
        vscode.languages.registerSignatureHelpProvider(selector, new CottonSignatureHelpProvider(), ' ', '='),
        vscode.languages.registerCodeLensProvider(selector, codeLensProvider),
        ...createAutoRenameTag(),
        ...createDynamicAttrDecorator(),
        vscode.languages.registerDocumentDropEditProvider(selector, new CottonDropEditProvider(), { dropMimeTypes: [COTTON_DRAG_MIME] }),
        diagnostics,
    );

    // Re-open the tag-completion popup when the user DELETES a character while
    // editing a `<c-...` tag name. VS Code only auto-triggers completion on the
    // `<` trigger char or while typing — never on deletion — so without this the
    // popup that closed never comes back. The decision lives in a pure, tested
    // helper; this listener is just the wire to `editor.action.triggerSuggest`.
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== e.document) { return; }
            if (vscode.languages.match(selector, e.document) === 0) { return; }
            for (const change of e.contentChanges) {
                const isDeletion = change.text.length === 0 && change.rangeLength > 0;
                const start = change.range.start;
                const linePrefix = e.document.lineAt(start.line).text.slice(0, start.character);
                if (shouldRetriggerTagCompletion(linePrefix, isDeletion)) {
                    void vscode.commands.executeCommand('editor.action.triggerSuggest');
                    return;
                }
            }
        }),
    );
}

/** Wire document diagnostics: debounced on keystroke, immediate on open/save,
 *  and run once over the documents already open at activation. */
function registerDiagnosticListeners(context: vscode.ExtensionContext, diagProvider: DiagnosticProvider): void {
    const diagTimers = new Map<string, ReturnType<typeof setTimeout>>();
    function debouncedDiag(doc: vscode.TextDocument): void {
        const key = doc.uri.toString();
        const existing = diagTimers.get(key);
        if (existing) { clearTimeout(existing); }
        diagTimers.set(key, setTimeout(() => {
            diagTimers.delete(key);
            diagProvider.update(doc);
        }, DIAGNOSTIC_DEBOUNCE_MS));
    }
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => debouncedDiag(e.document)),
        vscode.workspace.onDidOpenTextDocument(d => diagProvider.update(d)),
        vscode.workspace.onDidSaveTextDocument(d => diagProvider.update(d)),
    );
    vscode.workspace.textDocuments.forEach(d => diagProvider.update(d));
}
