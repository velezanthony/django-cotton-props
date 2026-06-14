import * as vscode from 'vscode';
import type { PropDefinition } from './models';

function formatOptions(options: string[], defaultValue: string): string {
    if (!options.length) { return ''; }
    return options
        .map(o => o === defaultValue ? `\`${o}\` *(default)*` : `\`${o}\``)
        .join(', ');
}

/**
 * Single-prop block for the tag hover and completion popups.
 *
 *   **`variant`** · *select* · default `"primary"`
 *   _Style variant_
 *   **Options:** `primary` *(default)*, `secondary`, `tertiary`
 *
 * Lines inside the block are joined with a Markdown soft break (`  \n`) so
 * they stay visually grouped. Callers separate consecutive blocks with
 * `\n\n` for breathing room — that is what keeps bullets from touching the
 * next prop name.
 */
export function formatPropSummary(p: PropDefinition): string {
    const badges: string[] = [];
    if (p.required) { badges.push('**required**'); }
    if (p.deprecated !== undefined) { badges.push('~~deprecated~~'); }
    if (p.hidden) { badges.push('*hidden*'); }
    const badgeStr = badges.length ? ` ${badges.join(' ')}` : '';

    const head = `**\`${p.cleanName}\`**${badgeStr} · *${p.type}*`;
    const defaultPart = p.hasDefault ? ` · default \`${p.defaultValue}\`` : '';

    const lines: string[] = [head + defaultPart];
    if (p.description) {
        lines.push(`_${p.description}_`);
    }
    if (p.type === 'select' && p.options.length) {
        lines.push(`**Options:** ${formatOptions(p.options, p.defaultValue)}`);
    }
    return lines.join('  \n');
}

export function formatPropDocs(p: PropDefinition, isDynamic = false): vscode.MarkdownString {
    const badges: string[] = [];
    if (p.required) { badges.push('*(required)*'); }
    if (p.deprecated !== undefined) { badges.push('*(deprecated)*'); }

    const lines: string[] = [`**${p.cleanName}** — \`${p.type}\`${badges.length ? ' ' + badges.join(' ') : ''}`];
    if (p.deprecated) { lines.push(`> ⚠️ **Deprecated:** ${p.deprecated}`); }
    if (p.description) { lines.push(p.description); }
    if (p.hasDefault) { lines.push(`**Default:** \`${p.defaultValue}\``); }
    if (p.options.length) { lines.push(`**Values:**  \n${formatOptions(p.options, p.defaultValue)}`); }
    if (p.example) { lines.push(`**Example:** \`${p.example}\``); }
    if (isDynamic) { lines.push('**`:prop`** — Passes a Django template variable instead of a literal string. Equivalent to `prop="{{ variable }}"`'); }
    return new vscode.MarkdownString(lines.join('\n\n'));
}
