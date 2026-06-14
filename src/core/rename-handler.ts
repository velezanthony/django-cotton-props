import * as vscode from 'vscode';
import { HTML_GLOB } from './constants';
import { filePathToTag, getWorkspaceExcludeGlob } from './scanner';
import { escapeRegex } from './regex';
import type { UsageIndex } from './usage-index';

/** Match c-<tag> only when followed by a non-tag-name char — prevents c-foo from matching inside c-foo-bar. */
export function buildTagMatchRegex(tag: string): RegExp {
    return new RegExp(`c-${escapeRegex(tag)}(?![\\w.-])`, 'g');
}

/**
 * Match `<c-component … is="oldTag" …>` so a tag rename also rewrites the
 * literal dispatch value. The capture group is the prefix up to (and
 * including) the opening quote so we can derive the value's exact offset
 * from `m.index + m[1].length`. `\2` is the backreference matching the
 * opening quote — single or double — so the closing quote stays in sync.
 *
 * Only LITERAL dispatch values are renamed. `is="prefix.{{ var }}"` keeps
 * referring to a namespace (not a specific tag), and `:is="expr"` is a
 * Django expression we can't statically rewrite.
 */
export function buildDispatchMatchRegex(tag: string): RegExp {
    // Require whitespace immediately before `is=` so we don't match `:is=`
    // (Django expression form). `\b` alone treats `:` as a word boundary and
    // would incorrectly accept the expression form.
    return new RegExp(
        `(<c-component\\b[^>]*?\\sis=(["']))${escapeRegex(tag)}\\2`,
        'g',
    );
}

async function buildRenameEdits(files: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>, usageIndex?: UsageIndex): Promise<vscode.WorkspaceEdit> {
    const edits = new vscode.WorkspaceEdit();

    for (const file of files) {
        const oldTag = filePathToTag(file.oldUri.fsPath);
        const newTag = filePathToTag(file.newUri.fsPath);

        if (!oldTag || !newTag || oldTag === newTag) { continue; }

        const tagRe = buildTagMatchRegex(oldTag);
        const dispatchRe = buildDispatchMatchRegex(oldTag);
        const newPattern = `c-${newTag}`;

        const htmlFiles = await vscode.workspace.findFiles(HTML_GLOB, getWorkspaceExcludeGlob());

        for (const htmlFile of htmlFiles) {
            if (htmlFile.fsPath === file.oldUri.fsPath) { continue; }

            const doc = await vscode.workspace.openTextDocument(htmlFile);
            const text = doc.getText();

            if (usageIndex) { usageIndex.updateFile(htmlFile, text); }

            for (const m of text.matchAll(tagRe)) {
                const start = doc.positionAt(m.index!);
                const end = doc.positionAt(m.index! + m[0].length);
                edits.replace(htmlFile, new vscode.Range(start, end), newPattern);
            }

            // Also rewrite literal `<c-component is="oldTag">` dispatches.
            for (const m of text.matchAll(dispatchRe)) {
                const valueStart = m.index! + m[1].length;
                const valueEnd = valueStart + oldTag.length;
                edits.replace(
                    htmlFile,
                    new vscode.Range(doc.positionAt(valueStart), doc.positionAt(valueEnd)),
                    newTag,
                );
            }
        }
    }

    return edits;
}

export function createRenameHandler(usageIndex: UsageIndex): vscode.Disposable {
    return vscode.workspace.onWillRenameFiles((e) => {
        e.waitUntil(buildRenameEdits(e.files, usageIndex));
    });
}

// Backup storage: file content saved before delete, restored if user cancels
const deleteBackup = new Map<string, { uri: vscode.Uri; content: Uint8Array; tag: string; total: number; fileCount: number }>();

export function createDeleteHandler(usageIndex: UsageIndex): vscode.Disposable[] {
    const willDelete = vscode.workspace.onWillDeleteFiles((e) => {
        e.waitUntil((async () => {
            for (const file of e.files) {
                const tag = filePathToTag(file.fsPath);
                if (!tag) { continue; }

                const { total, fileCount } = usageIndex.getUsage(tag);
                if (total === 0) { continue; }

                const content = await vscode.workspace.fs.readFile(file);
                deleteBackup.set(file.fsPath, { uri: file, content, tag, total, fileCount });
            }
            return new vscode.WorkspaceEdit();
        })());
    });

    const didDelete = vscode.workspace.onDidDeleteFiles(async (e) => {
        for (const file of e.files) {
            const backup = deleteBackup.get(file.fsPath);
            if (!backup) { continue; }
            deleteBackup.delete(file.fsPath);

            const choice = await vscode.window.showWarningMessage(
                `c-${backup.tag} is used ${backup.total} time${backup.total > 1 ? 's' : ''} in ${backup.fileCount} file${backup.fileCount > 1 ? 's' : ''}. Do you want to delete it?`,
                { modal: true },
                'Yes, Delete',
            );

            if (choice !== 'Yes, Delete') {
                await vscode.workspace.fs.writeFile(backup.uri, backup.content);
            }
        }
    });

    return [willDelete, didDelete];
}
