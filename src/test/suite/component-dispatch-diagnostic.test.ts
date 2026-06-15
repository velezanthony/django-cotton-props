import * as assert from 'assert';
import * as vscode from 'vscode';
import { DIAG_CODE } from '../../core/constants';
import { checkComponentDispatch } from '../../core/providers/diagnostics/usage-checks';

/**
 * The diagnostic tests under `diagnostics.test.ts` run against the test
 * workspace fixture files. The dispatch checker, on the other hand, is a
 * pure function over text — we can drive it directly with a stub
 * TextDocument and a synthesized RegExpExecArray, no workspace required.
 */
function makeDoc(text: string): vscode.TextDocument {
    return {
        getText: () => text,
        positionAt: (offset: number) => {
            const before = text.substring(0, offset);
            const lines = before.split('\n');
            return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
        },
    } as unknown as vscode.TextDocument;
}

function runOnFirstComponentTag(text: string): vscode.Diagnostic | undefined {
    // Mirror the regex usage-checks.ts uses to locate <c-component> tags.
    const re = /<c-(component)((?:\s[^>]*)?)\s*\/?>/g;
    const m = re.exec(text);
    if (!m) { throw new Error('Test setup: no <c-component> tag in text'); }
    const attrsStr = m[2] || '';
    return checkComponentDispatch(makeDoc(text), attrsStr, m);
}

suite('Diagnostic: <c-component> without is attribute', () => {

    test('flags <c-component /> with no attributes at all', () => {
        const text = '<c-component />';
        const diag = runOnFirstComponentTag(text);
        assert.ok(diag, 'Expected a diagnostic');
        assert.strictEqual(diag!.severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(diag!.code, DIAG_CODE.MISSING_IS_ATTRIBUTE);
        assert.ok(diag!.message.includes('requires an'), `Unexpected message: ${diag!.message}`);
    });

    test('flags <c-component class="x" /> with other attrs but no is', () => {
        const text = '<c-component class="size-5" />';
        const diag = runOnFirstComponentTag(text);
        assert.ok(diag);
        assert.strictEqual(diag!.code, DIAG_CODE.MISSING_IS_ATTRIBUTE);
    });

    test('range covers exactly <c-component>', () => {
        const text = '<c-component />';
        const diag = runOnFirstComponentTag(text);
        assert.ok(diag);
        // start (line 0, col 0) — end (line 0, col 12, length of "<c-component")
        assert.strictEqual(diag!.range.start.line, 0);
        assert.strictEqual(diag!.range.start.character, 0);
        assert.strictEqual(diag!.range.end.character, '<c-component'.length);
    });

    test('does NOT flag <c-component is="x" />', () => {
        const text = '<c-component is="atoms.button" />';
        const diag = runOnFirstComponentTag(text);
        // Either undefined (target resolves) or a component-not-found if it
        // doesn't — but NEVER a missing-is diagnostic.
        if (diag) {
            assert.notStrictEqual(diag.code, DIAG_CODE.MISSING_IS_ATTRIBUTE);
        }
    });

    test('does NOT flag <c-component :is="x" />', () => {
        const text = '<c-component :is="my_var" />';
        const diag = runOnFirstComponentTag(text);
        // :is satisfies the "has an is attribute" requirement — the dispatch
        // is just unresolvable at edit time, which is fine.
        assert.strictEqual(diag, undefined);
    });
});
