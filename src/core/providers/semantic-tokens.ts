import * as vscode from 'vscode';
import { cottonTagReferenceRe } from '../regex';
import { findDynamicAttrValues } from '../helpers';

const TOKEN_TYPES = ['comment', 'keyword', 'variable', 'string'];
const TOKEN_MODIFIERS: string[] = [];

export const SEMANTIC_LEGEND = new vscode.SemanticTokensLegend(TOKEN_TYPES, TOKEN_MODIFIERS);

const T_COMMENT = 0;   // {# #}
const T_KEYWORD = 1;   // @prop, @slot, @trigger, @strict, prop type
const T_VARIABLE = 2;  // prop name, filter names (default, description, required...)
const T_STRING = 3;    // filter values ("text", 13, False, ['opt1', 'opt2'])

const ANNOTATION_RE = /\{#\s*@(prop|slot|trigger|strict)\b/g;
const PROP_HEAD_RE = /(@\w+\s+)(:?[\w-]+):(\w+)(\[[^\]]*\])?/;
const FILTER_RE = /(\|)\s*([\w-]+)(?::(?:"([^"]*)"|(\S+)))?/g;

export class CottonSemanticTokenProvider implements vscode.DocumentSemanticTokensProvider {
    provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.SemanticTokens {
        const builder = new vscode.SemanticTokensBuilder(SEMANTIC_LEGEND);
        const text = document.getText();

        for (const match of text.matchAll(ANNOTATION_RE)) {
            const blockStart = match.index!;
            const closeIdx = text.indexOf('#}', blockStart + match[0].length);
            if (closeIdx === -1) { continue; }

            const fullBlock = text.substring(blockStart, closeIdx + 2);

            // {# → comment
            this.push(builder, document, blockStart, 2, T_COMMENT);

            // #} → comment
            this.push(builder, document, closeIdx, 2, T_COMMENT);

            // @keyword
            const kwOffset = blockStart + match[0].indexOf('@');
            this.push(builder, document, kwOffset, match[1].length + 1, T_KEYWORD);

            if (match[1] === 'strict') { continue; }

            if (match[1] === 'prop') {
                this.tokenizeProp(builder, document, blockStart, fullBlock);
            } else {
                this.tokenizeSlotTrigger(builder, document, blockStart, fullBlock);
            }
        }

        for (const tagMatch of text.matchAll(cottonTagReferenceRe())) {
            const fullTag = tagMatch[1]; // c-atoms.button
            const tagOffset = tagMatch.index! + tagMatch[0].length - fullTag.length;
            this.push(builder, document, tagOffset, fullTag.length, T_KEYWORD);
        }

        // Dynamic `:attr="value"` — tint the value like a Django variable, since
        // a `:`-prefixed attribute is an expression, not a literal string.
        for (const { start, end } of findDynamicAttrValues(text)) {
            this.push(builder, document, start, end - start, T_VARIABLE);
        }

        return builder.build();
    }

    private tokenizeProp(builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument, blockStart: number, block: string) {
        const headMatch = PROP_HEAD_RE.exec(block);
        if (!headMatch) { return; }

        const headOffset = blockStart + headMatch.index + headMatch[1].length;

        // Prop name → variable
        const name = headMatch[2];
        this.push(builder, document, headOffset, name.length, T_VARIABLE);

        // Type → string
        const typeStr = headMatch[3];
        const typeOffset = headOffset + name.length + 1;
        this.push(builder, document, typeOffset, typeStr.length, T_STRING);

        // Options [...] → string
        if (headMatch[4]) {
            const optsOffset = typeOffset + typeStr.length;
            this.push(builder, document, optsOffset, headMatch[4].length, T_STRING);
        }

        for (const fm of block.matchAll(FILTER_RE)) {
            const fmIndex = fm.index!;
            // | → comment
            this.push(builder, document, blockStart + fmIndex, 1, T_COMMENT);

            // Filter name (default, description, required...) → variable
            const filterName = fm[2];
            const filterNameOffset = blockStart + fmIndex + fm[0].indexOf(filterName);
            this.push(builder, document, filterNameOffset, filterName.length, T_VARIABLE);

            // Filter value → string
            if (fm[3] !== undefined) {
                // Quoted: "value" — include the quotes
                const quoted = `"${fm[3]}"`;
                const valOffset = blockStart + fmIndex + fm[0].indexOf(quoted);
                this.push(builder, document, valOffset, quoted.length, T_STRING);
            } else if (fm[4] !== undefined) {
                // Unquoted: 13, False, True
                const valOffset = blockStart + fmIndex + fm[0].indexOf(fm[4]);
                this.push(builder, document, valOffset, fm[4].length, T_STRING);
            }
        }
    }

    private tokenizeSlotTrigger(builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument, blockStart: number, block: string) {
        const kwEnd = block.indexOf(' ', block.indexOf('@'));
        if (kwEnd === -1) { return; }
        const content = block.substring(kwEnd, block.length - 2).trim();
        if (content.length > 0) {
            const contentOffset = blockStart + block.indexOf(content, kwEnd);
            this.push(builder, document, contentOffset, content.length, T_STRING);
        }
    }

    private push(builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument, offset: number, length: number, tokenType: number) {
        const pos = document.positionAt(offset);
        builder.push(pos.line, pos.character, length, tokenType, 0);
    }
}
