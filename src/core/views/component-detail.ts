import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CONTEXT_KEYS } from '../constants';
import { getCachedProps } from '../scanner';
import { highlightSource } from './source-highlight';
import type { PropDefinition } from '../models';

const MAX_SOURCE_CHARS = 10_000;
const SLOT_RE = /\{#\s*@slot\s+([^—#]*)(?:—\s*([^#]*))?\s*#\}/g;
const STRICT_RE = /\{#\s*@strict\s*#\}/;

export class ComponentDetailProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _currentTag?: string;
    private _currentFilePath?: string;
    /** Cached CSS read once at construction time. The webview body changes
     *  on every selection but the stylesheet does not — read-once-and-reuse
     *  beats re-reading per render. */
    private readonly _css: string;

    constructor(extensionUri: vscode.Uri) {
        const cssPath = path.join(extensionUri.fsPath, 'media', 'component-detail.css');
        try {
            this._css = fs.readFileSync(cssPath, 'utf-8');
        } catch (err) {
            console.error('[Cotton] Failed to load component-detail.css', err);
            this._css = '';
        }
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: false };
        // The view is torn down when hidden (its `when` clause goes false). Drop
        // the stale reference so `toggle` knows the next show must wait for VS
        // Code to recreate it (which calls back into here).
        webviewView.onDidDispose(() => { this._view = undefined; });

        // Re-render if we have a current component (VS Code recreates the webview after hide/show)
        if (this._currentTag && this._currentFilePath) {
            this.showComponent(this._currentTag, this._currentFilePath);
        }
    }

    toggle(tag: string, filePath: string) {
        if (this._currentTag === tag) {
            // Same component → hide the whole Detail section
            this._currentTag = undefined;
            this._currentFilePath = undefined;
            vscode.commands.executeCommand('setContext', CONTEXT_KEYS.DETAIL_VISIBLE, false);
        } else {
            // Different component → show Detail section with new component
            this._currentTag = tag;
            this._currentFilePath = filePath;
            vscode.commands.executeCommand('setContext', CONTEXT_KEYS.DETAIL_VISIBLE, true);
            // If the view already exists, render now. If it doesn't (first show, or
            // it was disposed while hidden), resolveWebviewView fires when VS Code
            // creates it and renders from _currentTag — no timing guess needed.
            if (this._view) {
                this.showComponent(tag, filePath);
            }
        }
    }

    showComponent(tag: string, filePath: string) {
        this._currentTag = tag;
        this._currentFilePath = filePath;
        if (!this._view) { return; }

        let source = '';
        try { source = fs.readFileSync(filePath, 'utf-8'); } catch (err) { console.error(`[Cotton] Failed to read component: ${filePath}`, err); }

        const props = getCachedProps(filePath);
        const slots = this.parseSlots(source);
        const hasStrict = STRICT_RE.test(source);

        const sections: string[] = [];

        // Header
        sections.push(`<h2>c-${this.escapeHtml(tag)}</h2>`);
        if (hasStrict) {
            sections.push('<span class="badge strict">@strict</span>');
        }

        // Props table
        if (props.length) {
            sections.push('<h3>Props</h3>');
            sections.push('<table>');
            sections.push('<tr><th>Name</th><th>Type</th><th>Default</th><th>Description</th></tr>');
            for (const p of props) {
                const badges: string[] = [];
                if (p.required) { badges.push('<span class="badge required">required</span>'); }
                if (p.deprecated !== undefined) { badges.push('<span class="badge deprecated">deprecated</span>'); }
                if (p.hidden) { badges.push('<span class="badge hidden">hidden</span>'); }

                const nameClass = p.deprecated !== undefined ? 'deprecated-name' : '';
                const defaultVal = p.hasDefault ? this.escapeHtml(p.defaultValue || '""') : '—';
                const desc = p.description ? this.escapeHtml(p.description) : '—';
                const deprecatedNote = p.deprecated ? `<br><small class="dep-note">${this.escapeHtml(p.deprecated)}</small>` : '';

                sections.push(
                    `<tr>` +
                    `<td data-label="Name"><code class="${nameClass}">${this.escapeHtml(p.name)}</code> ${badges.join(' ')}</td>` +
                    `<td data-label="Type">${this.typeBadge(p)}</td>` +
                    `<td data-label="Default"><code>${defaultVal}</code></td>` +
                    `<td data-label="Description">${desc}${deprecatedNote}</td>` +
                    `</tr>`
                );
            }
            sections.push('</table>');
        }

        // Slots
        if (slots.length) {
            sections.push('<h3>Slots</h3>');
            for (const s of slots) {
                sections.push(`<div class="slot"><code>${this.escapeHtml(s.name)}</code> — ${this.escapeHtml(s.description)}</div>`);
            }
        }

        sections.push('<h3>Source</h3>');
        const truncated = source.length > MAX_SOURCE_CHARS;
        const displaySource = truncated ? source.slice(0, MAX_SOURCE_CHARS) : source;
        const highlighted = highlightSource(displaySource);
        const truncationNotice = truncated ? '\n\n… (truncated — open file to view full source)' : '';
        sections.push(`<pre class="source"><code>${highlighted}${truncationNotice}</code></pre>`);

        this._view.webview.html = this.buildHtml(sections.join('\n'));
    }

    private typeBadge(p: PropDefinition): string {
        if (p.type === 'select' && p.options.length) {
            return `<span class="type select">${p.options.map(o => this.escapeHtml(o)).join(' | ')}</span>`;
        }
        const cls = p.type === 'boolean' ? 'bool' : p.type === 'number' ? 'num' : 'str';
        return `<span class="type ${cls}">${p.type}</span>`;
    }

    private parseSlots(source: string): { name: string; description: string }[] {
        const slots: { name: string; description: string }[] = [];
        for (const m of source.matchAll(SLOT_RE)) {
            slots.push({
                name: (m[1] || '').trim(),
                description: (m[2] || '').trim(),
            });
        }
        return slots;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    private buildHtml(body: string): string {
        // Defence-in-depth: scripts are already disabled on the webview, but a
        // strict CSP also blocks any external resource load (e.g. a stray
        // `<img src=http://…>` that slipped past escaping) from phoning home.
        // Only our own inline <style> is allowed.
        return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>${this._css}</style>
</head>
<body>${body}</body>
</html>`;
    }
}
