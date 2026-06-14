import * as vscode from 'vscode';
import { findDynamicAttrValues } from '../helpers';
import { isSupportedLanguage } from '../constants';

const UPDATE_DEBOUNCE_MS = 150;

/** Faded ghost `{{ ` / ` }}` rendered around a dynamic attribute value. The
 *  value text itself is tinted by the semantic-token provider; here we only add
 *  the non-editable braces so the user reads `:size="{{ md }}"` while the file
 *  still holds `:size="md"`. */
function createDecorationType(): vscode.TextEditorDecorationType {
    const ghost: vscode.ThemableDecorationAttachmentRenderOptions = {
        color: new vscode.ThemeColor('editorGhostText.foreground'),
        fontStyle: 'italic',
    };
    return vscode.window.createTextEditorDecorationType({
        before: { ...ghost, contentText: '{{ ' },
        after: { ...ghost, contentText: ' }}' },
    });
}

function computeRanges(document: vscode.TextDocument): vscode.Range[] {
    return findDynamicAttrValues(document.getText()).map(({ start, end }) =>
        new vscode.Range(document.positionAt(start), document.positionAt(end)),
    );
}

function enabled(): boolean {
    return vscode.workspace
        .getConfiguration('djangoCottonProps')
        .get<boolean>('dynamicAttr.showExpressionHint', true);
}

/**
 * Wires the dynamic-attribute ghost-brace decoration to the editor lifecycle.
 * Returns disposables for `context.subscriptions`.
 */
export function createDynamicAttrDecorator(): vscode.Disposable[] {
    const decorationType = createDecorationType();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    function apply(editor: vscode.TextEditor): void {
        if (!isSupportedLanguage(editor.document.languageId) || !enabled()) {
            editor.setDecorations(decorationType, []);
            return;
        }
        editor.setDecorations(decorationType, computeRanges(editor.document));
    }

    function applyAll(): void {
        for (const editor of vscode.window.visibleTextEditors) { apply(editor); }
    }

    function scheduleForDoc(doc: vscode.TextDocument): void {
        const key = doc.uri.toString();
        const existing = timers.get(key);
        if (existing) { clearTimeout(existing); }
        timers.set(key, setTimeout(() => {
            timers.delete(key);
            for (const editor of vscode.window.visibleTextEditors) {
                if (editor.document.uri.toString() === key) { apply(editor); }
            }
        }, UPDATE_DEBOUNCE_MS));
    }

    applyAll();

    return [
        decorationType,
        vscode.window.onDidChangeActiveTextEditor(e => { if (e) { apply(e); } }),
        vscode.window.onDidChangeVisibleTextEditors(applyAll),
        vscode.workspace.onDidChangeTextDocument(e => scheduleForDoc(e.document)),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('djangoCottonProps.dynamicAttr.showExpressionHint')) { applyAll(); }
        }),
    ];
}
