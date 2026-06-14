import * as vscode from 'vscode';
import { COTTON_TAG_PREFIX, isSupportedLanguage } from '../constants';

// Stateless auto-rename: on each change, check if the opening/closing tag pair
// at the cursor position is in sync. If not, update the counterpart.
// Debounced per document to batch rapid bursts (held backspace, autocomplete).

const DEBOUNCE_MS = 40;

let isApplyingEdit = false;
const pendingByDoc = new Map<string, { timer: ReturnType<typeof setTimeout>; changeOffset: number }>();

export function createAutoRenameTag(): vscode.Disposable[] {
    const changeListener = vscode.workspace.onDidChangeTextDocument((e) => {
        if (isApplyingEdit) { return; }
        if (!isSupportedLanguage(e.document.languageId)) { return; }
        if (e.contentChanges.length === 0) { return; }

        const key = e.document.uri.toString();
        const existing = pendingByDoc.get(key);
        if (existing) { clearTimeout(existing.timer); }

        const changeOffset = e.contentChanges[0].rangeOffset;
        const timer = setTimeout(() => {
            pendingByDoc.delete(key);
            void applyAutoRename(e.document, changeOffset);
        }, DEBOUNCE_MS);
        pendingByDoc.set(key, { timer, changeOffset });
    });

    const cleanup = new vscode.Disposable(() => {
        for (const { timer } of pendingByDoc.values()) { clearTimeout(timer); }
        pendingByDoc.clear();
    });

    return [changeListener, cleanup];
}

async function applyAutoRename(document: vscode.TextDocument, changeOffset: number): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) { return; }

    const text = document.getText();
    const context = findTagAtOffset(text, changeOffset);
    if (!context) { return; }

    const counterpart = context.isClosing
        ? findMatchingOpenTag(text, context.tagStart)
        : findMatchingCloseTag(text, context.tagEnd);
    if (!counterpart) { return; }
    if (context.name === counterpart.name) { return; }

    const replaceRange = new vscode.Range(
        document.positionAt(counterpart.nameStart),
        document.positionAt(counterpart.nameEnd),
    );

    isApplyingEdit = true;
    try {
        await editor.edit(
            (b) => { b.replace(replaceRange, context.name); },
            { undoStopBefore: false, undoStopAfter: false },
        );
    } catch (err) {
        console.error('[Cotton] Auto-rename edit failed:', err);
    } finally {
        isApplyingEdit = false;
    }
}

interface TagInfo {
    name: string;       // tag name after c- (e.g. "atoms.button")
    nameStart: number;  // offset of name start in document
    nameEnd: number;    // offset of name end
    tagStart: number;   // offset of < in document
    tagEnd: number;     // offset of > + 1
    isClosing: boolean;
}

/** Find the cotton tag (opening or closing) that contains the given offset */
function findTagAtOffset(text: string, offset: number): TagInfo | undefined {
    // Search backward for < that starts a tag containing our offset
    let searchFrom = offset;
    while (searchFrom >= 0) {
        const ltIdx = text.lastIndexOf('<', searchFrom);
        if (ltIdx === -1) { return undefined; }

        const gtIdx = text.indexOf('>', ltIdx);
        if (gtIdx === -1 || gtIdx < offset) {
            // The > is before our offset — this tag doesn't contain us
            searchFrom = ltIdx - 1;
            continue;
        }

        // We're inside the tag from ltIdx to gtIdx
        const tagText = text.substring(ltIdx, gtIdx + 1);
        const isClosing = tagText.startsWith('</');
        const prefix = isClosing ? '</' : '<';

        const nameMatch = tagText.match(/^<\/?c-([\w.-]*)/);
        if (!nameMatch) {
            searchFrom = ltIdx - 1;
            continue;
        }

        const name = nameMatch[1];
        const nameStart = ltIdx + prefix.length + 2; // skip </ or < then "c-"
        const nameEnd = nameStart + name.length;

        // Only trigger if cursor is within the tag name area (not in attributes)
        // For opening: <c-name attrs>  — cursor should be in "c-name" area
        // For closing: </c-name>       — cursor anywhere in tag
        const nameAreaEnd = isClosing ? gtIdx : nameEnd;
        if (offset > nameAreaEnd) {
            searchFrom = ltIdx - 1;
            continue;
        }

        return {
            name,
            nameStart,
            nameEnd,
            tagStart: ltIdx,
            tagEnd: gtIdx + 1,
            isClosing,
        };
    }
    return undefined;
}

/** Find the matching closing tag searching forward from afterOffset */
function findMatchingCloseTag(text: string, afterOffset: number): TagInfo | undefined {
    const re = /<(\/?)(c-)([\w.-]*)/g;
    re.lastIndex = afterOffset;
    let depth = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        const isClose = m[1] === '/';
        const name = m[3];
        const gtIdx = text.indexOf('>', m.index);
        if (gtIdx === -1) { continue; }

        if (isClose) {
            if (depth === 0) {
                const nameOff = m.index + 1 + m[1].length + m[2].length; // +1 for '<'
                return {
                    name,
                    nameStart: nameOff,
                    nameEnd: nameOff + name.length,
                    tagStart: m.index,
                    tagEnd: gtIdx + 1,
                    isClosing: true,
                };
            }
            depth--;
        } else {
            // Check self-closing
            if (text[gtIdx - 1] !== '/') { depth++; }
        }
    }
    return undefined;
}

/** Find the matching opening tag searching backward from beforeOffset */
function findMatchingOpenTag(text: string, beforeOffset: number): TagInfo | undefined {
    // Collect all cotton tags before the offset
    const re = /<(\/?)(c-)([\w.-]*)/g;
    const tags: { index: number; isClose: boolean; name: string; fullMatch: string }[] = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index >= beforeOffset) { break; }
        tags.push({ index: m.index, isClose: m[1] === '/', name: m[3], fullMatch: m[0] });
    }

    // Walk backward to find matching open at depth 0
    let depth = 0;
    for (let i = tags.length - 1; i >= 0; i--) {
        const t = tags[i];
        const gtIdx = text.indexOf('>', t.index);
        if (gtIdx === -1) { continue; }

        if (t.isClose) {
            depth++;
        } else {
            if (text[gtIdx - 1] === '/') { continue; } // self-closing
            if (depth === 0) {
                return {
                    name: t.name,
                    nameStart: t.index + COTTON_TAG_PREFIX.length,
                    nameEnd: t.index + COTTON_TAG_PREFIX.length + t.name.length,
                    tagStart: t.index,
                    tagEnd: gtIdx + 1,
                    isClosing: false,
                };
            }
            depth--;
        }
    }
    return undefined;
}
