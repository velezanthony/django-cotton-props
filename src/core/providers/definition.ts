import * as vscode from 'vscode';
import { COTTON_TAG_RE } from '../constants';
import { findComponentFile } from '../scanner';
import { findIsAttributes } from './is-context';

export class DefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.DefinitionLink[] | undefined {
        const line = document.lineAt(position.line).text;
        const char = position.character;

        // 1. Direct `<c-tag>` reference under cursor (always on the cursor line).
        for (const match of line.matchAll(COTTON_TAG_RE)) {
            if (char < match.index! || char > match.index! + match[0].length) { continue; }
            const filePath = findComponentFile(match[1]);
            if (!filePath) { return undefined; }
            const nameStart = match.index! + 2;
            const range = new vscode.Range(
                new vscode.Position(position.line, nameStart),
                new vscode.Position(position.line, nameStart + match[1].length),
            );
            return linkTo(filePath, range);
        }

        // 2. `<c-component is="literal-target">` — scan the whole document so
        //    multi-line tag declarations are covered.
        const offset = document.offsetAt(position);
        for (const ctx of findIsAttributes(document.getText())) {
            if (offset < ctx.valueStart || offset > ctx.valueEnd) { continue; }
            if (ctx.expression || ctx.hasInterpolation) { return undefined; }
            const filePath = findComponentFile(ctx.value);
            if (!filePath) { return undefined; }
            const range = new vscode.Range(
                document.positionAt(ctx.valueStart),
                document.positionAt(ctx.valueEnd),
            );
            return linkTo(filePath, range);
        }

        return undefined;
    }
}

function linkTo(filePath: string, originSelectionRange: vscode.Range): vscode.DefinitionLink[] {
    return [{
        originSelectionRange,
        targetUri: vscode.Uri.file(filePath),
        targetRange: new vscode.Range(0, 0, 0, 0),
        targetSelectionRange: new vscode.Range(0, 0, 0, 0),
    }];
}
