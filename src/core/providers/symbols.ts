import * as vscode from 'vscode';
import { isCottonFile } from '../scanner';
import { PROP_BLOCK_RE, parsePropFilters } from '../parser';

const SLOT_RE = /\{#\s*@slot\s+([^—#]*)(?:—\s*([^#]*))?\s*#\}/g;
const TRIGGER_RE = /\{#\s*@trigger\s+([^—#]*)(?:—\s*([^#]*))?\s*#\}/g;
const STRICT_RE = /\{#\s*@strict\s*#\}/;

export class CottonSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] | undefined {
        if (!isCottonFile(document.uri)) { return undefined; }

        const text = document.getText();
        const symbols: vscode.DocumentSymbol[] = [];

        for (const m of text.matchAll(PROP_BLOCK_RE)) {
            const prop = parsePropFilters(m[1]);
            if (!prop) { continue; }
            const startPos = document.positionAt(m.index!);
            const endPos = document.positionAt(m.index! + m[0].length);
            const range = new vscode.Range(startPos, endPos);

            const badges: string[] = [prop.type];
            if (prop.required) { badges.push('required'); }
            if (prop.deprecated !== undefined) { badges.push('deprecated'); }
            if (prop.hasDefault) { badges.push(`= "${prop.defaultValue}"`); }
            symbols.push(new vscode.DocumentSymbol(prop.cleanName, badges.join(' '), vscode.SymbolKind.Property, range, range));
        }

        for (const m of text.matchAll(SLOT_RE)) {
            const content = (m[1] || '').trim();
            const startPos = document.positionAt(m.index!);
            const endPos = document.positionAt(m.index! + m[0].length);
            const range = new vscode.Range(startPos, endPos);
            symbols.push(new vscode.DocumentSymbol('slot', content, vscode.SymbolKind.Field, range, range));
        }

        for (const m of text.matchAll(TRIGGER_RE)) {
            const content = (m[1] || '').trim();
            const startPos = document.positionAt(m.index!);
            const endPos = document.positionAt(m.index! + m[0].length);
            const range = new vscode.Range(startPos, endPos);
            symbols.push(new vscode.DocumentSymbol('trigger', content, vscode.SymbolKind.Event, range, range));
        }

        const strictMatch = STRICT_RE.exec(text);
        if (strictMatch) {
            const startPos = document.positionAt(strictMatch.index);
            const endPos = document.positionAt(strictMatch.index + strictMatch[0].length);
            const range = new vscode.Range(startPos, endPos);
            symbols.push(new vscode.DocumentSymbol('@strict', 'strict mode enabled', vscode.SymbolKind.Constant, range, range));
        }

        return symbols.length ? symbols : undefined;
    }
}
