import * as vscode from 'vscode';
import { isCottonFile } from '../scanner';

export class AnnotationCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
        if (!isCottonFile(document.uri)) { return undefined; }

        const linePrefix = document.lineAt(position).text.substring(0, position.character);

        const match = linePrefix.match(/@([\w:]*)$/);
        if (!match) { return undefined; }

        const typed = match[1].toLowerCase();
        const replaceStart = new vscode.Position(position.line, position.character - match[0].length);
        const replaceRange = new vscode.Range(replaceStart, position);

        const snippets = [
            { label: '@prop:text', filter: 'prop:text', snippet: '{# @prop ${1:name}:text | default:"${2:}" | description:"${3:Description}" #}', doc: 'Text prop — free string\n\n`{# @prop label:text | default:"Click me" | description:"Button label" #}`' },
            { label: '@prop:number', filter: 'prop:number', snippet: '{# @prop ${1::}${2:name}:number | default:${3:0} | description:"${4:Description}" #}', doc: 'Number prop — numeric value\n\n`{# @prop :count:number | default:5 | description:"Item count" #}`' },
            { label: '@prop:boolean', filter: 'prop:boolean', snippet: '{# @prop ${1:name}:boolean | default:${2|True,False|} | description:"${3:Description}" #}', doc: 'Boolean prop — True or False\n\n`{# @prop loading:boolean | default:False | description:"Show spinner" #}`' },
            { label: '@prop:select', filter: 'prop:select', snippet: '{# @prop ${1:name}:select[\'${2:opt1}\', \'${3:opt2}\'] | default:"${2:opt1}" | description:"${4:Description}" #}', doc: 'Select prop — predefined options\n\n`{# @prop variant:select[\'primary\', \'secondary\'] | default:"primary" | description:"Style" #}`' },
            { label: '@prop:text:required', filter: 'prop:text:required', snippet: '{# @prop ${1:name}:text | description:"${2:Description}" | required #}', doc: 'Required text prop — no default\n\n`{# @prop lat:text | description:"Latitude" | required #}`' },
            { label: '@prop:number:required', filter: 'prop:number:required', snippet: '{# @prop ${1:name}:number | description:"${2:Description}" | required #}', doc: 'Required number prop — no default\n\n`{# @prop count:number | description:"Total items" | required #}`' },
            { label: '@description', filter: 'description', snippet: '{# @description ${1:One-line component summary.} #}', doc: 'Component description — single line shown on hover\n\n`{# @description A button that triggers an action. #}`' },
            { label: '@slot', filter: 'slot', snippet: '{# @slot ${1:Default content} — ${2:Description} #}', doc: 'Default slot — content + description\n\n`{# @slot Click me — Button label #}`' },
            { label: '@slot — description', filter: 'slot:desc', snippet: '{# @slot — ${1:Description} #}', doc: 'Default slot — description only (no default content)\n\n`{# @slot — Card body content. #}`' },
            { label: '@slot:NAME', filter: 'slot:named', snippet: '{# @slot:${1:slotname} #}', doc: 'Named slot — bare declaration\n\n`{# @slot:header #}`' },
            { label: '@slot:NAME — description', filter: 'slot:named:desc', snippet: '{# @slot:${1:slotname} — ${2:Description} #}', doc: 'Named slot — with description\n\n`{# @slot:header — Header content #}`' },
            { label: '@trigger', filter: 'trigger', snippet: '{# @trigger ${1:element} — ${2:Description} #}', doc: 'Trigger element for modals/drawers\n\n`{# @trigger <button>Open</button> — Trigger #}`' },
            { label: '@strict', filter: 'strict', snippet: '{# @strict #}', doc: 'Strict mode — unknown props show as warnings' },
        ];

        return snippets
            .filter(s => !typed || s.filter.startsWith(typed))
            .map(s => {
                const item = new vscode.CompletionItem(s.label, vscode.CompletionItemKind.Snippet);
                item.insertText = new vscode.SnippetString(s.snippet);
                item.range = replaceRange;
                item.filterText = s.filter;
                item.documentation = new vscode.MarkdownString(s.doc);
                return item;
            });
    }
}
