import * as assert from 'assert';
import * as vscode from 'vscode';
import { attachQuickFix, getQuickFix } from '../../core/providers/diagnostics/quick-fix-data';
import type { QuickFixData } from '../../core/models';

function fakeDiagnostic(message = 'test'): vscode.Diagnostic {
    return new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 1),
        message,
        vscode.DiagnosticSeverity.Warning,
    );
}

suite('quick-fix data attach/get', () => {

    test('get returns undefined when no data attached', () => {
        const diag = fakeDiagnostic();
        assert.strictEqual(getQuickFix(diag), undefined);
    });

    test('attach then get returns the same data', () => {
        const diag = fakeDiagnostic();
        const data: QuickFixData = { kind: 'undocumented', suggestion: '{# @prop foo:text #}', cVarsOrder: 1 };
        attachQuickFix(diag, data);
        assert.deepStrictEqual(getQuickFix(diag), data);
    });

    test('different diagnostics hold independent data', () => {
        const a = fakeDiagnostic('a');
        const b = fakeDiagnostic('b');
        attachQuickFix(a, { kind: 'undocumented', suggestion: 'A', cVarsOrder: 1 });
        attachQuickFix(b, { kind: 'undocumented', suggestion: 'B', cVarsOrder: 2 });
        const da = getQuickFix(a);
        const db = getQuickFix(b);
        assert.strictEqual(da?.kind === 'undocumented' ? da.suggestion : null, 'A');
        assert.strictEqual(db?.kind === 'undocumented' ? db.suggestion : null, 'B');
    });

    test('attach overwrites prior data on same diagnostic', () => {
        const diag = fakeDiagnostic();
        attachQuickFix(diag, { kind: 'undocumented', suggestion: 'first', cVarsOrder: 1 });
        attachQuickFix(diag, { kind: 'undocumented', suggestion: 'second', cVarsOrder: 2 });
        const data = getQuickFix(diag);
        assert.strictEqual(data?.kind === 'undocumented' ? data.suggestion : null, 'second');
    });

    test('supports all QuickFixData kinds', () => {
        const kinds: QuickFixData[] = [
            { kind: 'missing-from-cvars', attrText: 'foo=""', insertOffset: 10 },
            { kind: 'sync-default', replaceStart: 0, replaceEnd: 5, newText: 'bar' },
            { kind: 'undocumented', suggestion: '{# @prop x #}', cVarsOrder: 1 },
            { kind: 'missing-required', propName: 'foo', propType: 'text', propDefault: '', insertOffset: 0 },
        ];
        for (const data of kinds) {
            const diag = fakeDiagnostic();
            attachQuickFix(diag, data);
            assert.deepStrictEqual(getQuickFix(diag), data);
        }
    });
});
