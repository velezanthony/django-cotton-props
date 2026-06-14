import * as assert from 'assert';
import * as vscode from 'vscode';
import { DIAG_CODE } from '../../core/constants';
import {
    checkDynamicPrefixMismatch,
    checkEnumDefaultOutOfRange,
    checkMissingCVars,
    checkMissingDescription,
    checkRequiredWithDefault,
    checkTypeDefaultMismatch,
} from '../../core/providers/diagnostics/rules';

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

suite('Parity: required-with-default conflict', () => {

    test('flags @prop with both | required and | default:', () => {
        const text = '{# @prop title:text | required | default:"x" | description:"d" #}';
        const diags = checkRequiredWithDefault(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(diags[0].code, DIAG_CODE.REQUIRED_WITH_DEFAULT_CONFLICT);
        assert.ok(diags[0].message.includes('title'));
    });

    test('does not flag @prop with only | required', () => {
        const text = '{# @prop title:text | required | description:"d" #}';
        const diags = checkRequiredWithDefault(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('does not flag @prop with only | default:', () => {
        const text = '{# @prop title:text | default:"x" | description:"d" #}';
        const diags = checkRequiredWithDefault(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('does not flag @prop with neither', () => {
        const text = '{# @prop title:text | description:"d" #}';
        const diags = checkRequiredWithDefault(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('range subraya el `| required` específico, no toda la línea', () => {
        const text = '{# @prop title:text | required | default:"x" #}';
        const diags = checkRequiredWithDefault(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        const range = diags[0].range;
        // The flagged span must exactly cover '| required'.
        const flagged = text.substring(
            text.indexOf('| required'),
            text.indexOf('| required') + '| required'.length,
        );
        assert.strictEqual(flagged, '| required');
        // Range start matches the start of '| required'.
        assert.strictEqual(range.start.line, 0);
        assert.strictEqual(range.start.character, text.indexOf('| required'));
        assert.strictEqual(range.end.character, text.indexOf('| required') + '| required'.length);
    });

    test('detects the conflict regardless of filter order (default first)', () => {
        const text = '{# @prop title:text | default:"x" | required #}';
        const diags = checkRequiredWithDefault(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
    });

    test('emits one diagnostic per conflicting @prop', () => {
        const text = [
            '{# @prop a:text | required | default:"1" #}',
            '{# @prop b:text | required #}',  // no default → no conflict
            '{# @prop c:text | required | default:"3" #}',
        ].join('\n');
        const diags = checkRequiredWithDefault(makeDoc(text), text);
        assert.strictEqual(diags.length, 2);
        assert.ok(diags[0].message.includes("'a'"));
        assert.ok(diags[1].message.includes("'c'"));
    });

    test('handles dynamic-prefixed prop names in the message', () => {
        const text = '{# @prop :foo:text | required | default:"x" #}';
        const diags = checkRequiredWithDefault(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        // Message should reference the clean name without `:` prefix.
        assert.ok(diags[0].message.includes("'foo'"), `Got: ${diags[0].message}`);
    });

    test('does not match `required` when not preceded by `|`', () => {
        // `required` as the type or in a string value should not trigger.
        const text = '{# @prop title:text | description:"required field" | default:"x" #}';
        const diags = checkRequiredWithDefault(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });
});

suite('Parity: type-default-mismatch', () => {

    test('flags boolean default that is not in the recognised set', () => {
        const text = '{# @prop loading:boolean | default:"yes" #}';
        const diags = checkTypeDefaultMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(diags[0].code, DIAG_CODE.TYPE_DEFAULT_MISMATCH);
        assert.ok(diags[0].message.includes('boolean'));
        assert.ok(diags[0].message.includes('yes'));
    });

    test('accepts True / False / true / false / 1 / 0 for boolean', () => {
        for (const tok of ['True', 'False', 'true', 'false', '1', '0']) {
            const text = `{# @prop loading:boolean | default:${tok} #}`;
            const diags = checkTypeDefaultMismatch(makeDoc(text), text);
            assert.strictEqual(diags.length, 0, `Expected no diagnostic for boolean default '${tok}'`);
        }
    });

    test('flags number default that is not parseable', () => {
        const text = '{# @prop count:number | default:"abc" #}';
        const diags = checkTypeDefaultMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        assert.ok(diags[0].message.includes('number'));
        assert.ok(diags[0].message.includes('abc'));
    });

    test('accepts integer and float for number', () => {
        for (const tok of ['0', '42', '-3', '3.14', '-0.5']) {
            const text = `{# @prop count:number | default:${tok} #}`;
            const diags = checkTypeDefaultMismatch(makeDoc(text), text);
            assert.strictEqual(diags.length, 0, `Expected no diagnostic for number default '${tok}'`);
        }
    });

    test('does not flag text props (no constraint)', () => {
        const text = '{# @prop title:text | default:"anything goes here" #}';
        const diags = checkTypeDefaultMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('does not flag select props (handled by enum-out-of-range rule)', () => {
        const text = '{# @prop variant:select[\'a\',\'b\'] | default:"z" #}';
        const diags = checkTypeDefaultMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('does not flag @prop with no default at all', () => {
        const text = '{# @prop count:number | description:"d" #}';
        const diags = checkTypeDefaultMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('range subraya el VALOR del default, no el filter completo', () => {
        const text = '{# @prop loading:boolean | default:"yes" #}';
        const diags = checkTypeDefaultMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        const r = diags[0].range;
        // Flagged span should be exactly `yes`, not `| default:"yes"`.
        assert.strictEqual(r.start.character, text.indexOf('yes'));
        assert.strictEqual(r.end.character, text.indexOf('yes') + 'yes'.length);
    });

    test('flags one diagnostic per offending @prop, leaves others alone', () => {
        const text = [
            '{# @prop ok:boolean | default:True #}',
            '{# @prop bad:boolean | default:"no" #}',
            '{# @prop n:number | default:42 #}',
            '{# @prop n2:number | default:"x" #}',
        ].join('\n');
        const diags = checkTypeDefaultMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 2);
        assert.ok(diags.some(d => d.message.includes("'bad'")));
        assert.ok(diags.some(d => d.message.includes("'n2'")));
    });
});

suite('Parity: enum-default-out-of-range', () => {

    test('flags @prop default that is not in the listed options', () => {
        const text = "{# @prop variant:select['primary','secondary','ghost'] | default:\"danger\" #}";
        const diags = checkEnumDefaultOutOfRange(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(diags[0].code, DIAG_CODE.ENUM_DEFAULT_OUT_OF_RANGE);
        assert.ok(diags[0].message.includes("'variant'"));
        assert.ok(diags[0].message.includes('danger'));
    });

    test('accepts @prop default that IS in options', () => {
        const text = "{# @prop variant:select['primary','secondary'] | default:\"primary\" #}";
        const diags = checkEnumDefaultOutOfRange(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('does not flag empty default', () => {
        const text = "{# @prop variant:select['primary','secondary'] | default:\"\" #}";
        const diags = checkEnumDefaultOutOfRange(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('flags <c-vars> value that is not in the prop options', () => {
        const text = [
            "{# @prop variant:select['primary','secondary','ghost'] #}",
            '<c-vars variant="danger" />',
        ].join('\n');
        const diags = checkEnumDefaultOutOfRange(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        assert.ok(diags[0].message.includes('<c-vars>'));
        assert.ok(diags[0].message.includes("'variant'"));
        assert.ok(diags[0].message.includes('danger'));
    });

    test('does not flag <c-vars> bare flag (no value)', () => {
        const text = [
            "{# @prop variant:select['primary','secondary'] #}",
            '<c-vars variant />',
        ].join('\n');
        const diags = checkEnumDefaultOutOfRange(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('flags BOTH @prop default AND <c-vars> value when both wrong', () => {
        const text = [
            "{# @prop v:select['a','b'] | default:\"z\" #}",
            '<c-vars v="x" />',
        ].join('\n');
        const diags = checkEnumDefaultOutOfRange(makeDoc(text), text);
        assert.strictEqual(diags.length, 2);
    });

    test('does not flag attrs that are not select-typed', () => {
        const text = [
            "{# @prop title:text #}",
            '<c-vars title="anything" />',
        ].join('\n');
        const diags = checkEnumDefaultOutOfRange(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('skips select props with empty options list', () => {
        // `select[]` has no options to check against — skip silently.
        const text = "{# @prop v:select[] | default:\"x\" #}";
        const diags = checkEnumDefaultOutOfRange(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('range subraya el VALOR del default, no el filter completo', () => {
        const text = "{# @prop v:select['a','b'] | default:\"z\" #}";
        const diags = checkEnumDefaultOutOfRange(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        const r = diags[0].range;
        assert.strictEqual(r.start.character, text.indexOf('"z"') + 1);
        assert.strictEqual(r.end.character, text.indexOf('"z"') + 2);
    });
});

suite('Parity: dynamic-prefix-mismatch', () => {

    test('flags @prop with `:` prefix and <c-vars> without', () => {
        const text = [
            '{# @prop :foo:text #}',
            '<c-vars foo="bar" />',
        ].join('\n');
        const diags = checkDynamicPrefixMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(diags[0].code, DIAG_CODE.DYNAMIC_PREFIX_MISMATCH);
        assert.ok(diags[0].message.includes(":foo"));
        assert.ok(diags[0].message.includes("'foo'"));
    });

    test('flags <c-vars> with `:` prefix and @prop without', () => {
        const text = [
            '{# @prop foo:text #}',
            '<c-vars :foo="bar" />',
        ].join('\n');
        const diags = checkDynamicPrefixMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
    });

    test('does not flag when prefixes match (both dynamic)', () => {
        const text = [
            '{# @prop :foo:text #}',
            '<c-vars :foo="bar" />',
        ].join('\n');
        const diags = checkDynamicPrefixMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('does not flag when prefixes match (both static)', () => {
        const text = [
            '{# @prop foo:text #}',
            '<c-vars foo="bar" />',
        ].join('\n');
        const diags = checkDynamicPrefixMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('does not flag c-vars attrs that have no matching @prop', () => {
        const text = [
            '{# @prop foo:text #}',
            '<c-vars foo="bar" :extra="undocumented" />',
        ].join('\n');
        const diags = checkDynamicPrefixMismatch(makeDoc(text), text);
        // `extra` has no @prop counterpart → skip silently (UNDOCUMENTED_PROP owns it).
        assert.strictEqual(diags.length, 0);
    });

    test('range subraya el `:name` o `name` en c-vars, no el valor', () => {
        const text = [
            '{# @prop :foo:text #}',
            '<c-vars foo="bar" />',
        ].join('\n');
        const diags = checkDynamicPrefixMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        const r = diags[0].range;
        // Span covers exactly `foo` on line 1 of c-vars (line index 1 in source).
        assert.strictEqual(r.start.line, 1);
        const cvarsLine = text.split('\n')[1];
        assert.strictEqual(r.start.character, cvarsLine.indexOf('foo'));
        assert.strictEqual(r.end.character, cvarsLine.indexOf('foo') + 'foo'.length);
    });

    test('flags multiple mismatches in the same c-vars', () => {
        const text = [
            '{# @prop :a:text #}',
            '{# @prop b:text #}',
            '<c-vars a="x" :b="y" />',
        ].join('\n');
        const diags = checkDynamicPrefixMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 2);
    });

    test('returns no diagnostics when no <c-vars> tag', () => {
        const text = '{# @prop :foo:text #}';
        const diags = checkDynamicPrefixMismatch(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });
});

suite('Parity: missing-cvars', () => {

    test('flags component with @prop but no <c-vars>', () => {
        const text = '{# @prop title:text #}\n<div>{{ title }}</div>';
        const diags = checkMissingCVars(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Warning);
        assert.strictEqual(diags[0].code, DIAG_CODE.MISSING_CVARS_TAG);
        assert.ok(diags[0].message.includes('@prop'));
        assert.ok(diags[0].message.includes('<c-vars>'));
    });

    test('does not flag when <c-vars> exists', () => {
        const text = [
            '{# @prop title:text #}',
            '<c-vars title="" />',
            '<div>{{ title }}</div>',
        ].join('\n');
        const diags = checkMissingCVars(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('does not flag when <c-vars /> self-closing exists', () => {
        const text = '{# @prop title:text #}\n<c-vars />';
        const diags = checkMissingCVars(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('does not flag when there are no @prop blocks', () => {
        const text = '<div>plain html</div>';
        const diags = checkMissingCVars(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('emits exactly ONE diagnostic even with many @prop blocks', () => {
        const text = [
            '{# @prop a:text #}',
            '{# @prop b:text #}',
            '{# @prop c:text #}',
            '<div>no c-vars here</div>',
        ].join('\n');
        const diags = checkMissingCVars(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
    });

    test('range anchored on the FIRST @prop block (not line 0)', () => {
        const text = '<div>preamble</div>\n{# @prop title:text #}';
        const diags = checkMissingCVars(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        const r = diags[0].range;
        // First @prop is on line 1 (after the preamble div).
        assert.strictEqual(r.start.line, 1);
    });
});

suite('Parity: missing-description', () => {

    test('flags @prop without | description: filter', () => {
        const text = '{# @prop title:text #}';
        const diags = checkMissingDescription(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Hint);
        assert.strictEqual(diags[0].code, DIAG_CODE.MISSING_PROP_DESCRIPTION);
        assert.ok(diags[0].message.includes("'title'"));
    });

    test('does not flag @prop with description', () => {
        const text = '{# @prop title:text | description:"the title" #}';
        const diags = checkMissingDescription(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('does not flag @prop with empty-string description', () => {
        const text = '{# @prop title:text | description:"" #}';
        const diags = checkMissingDescription(makeDoc(text), text);
        // Filter is present (just empty) → don't pile on. The user can fill in later.
        assert.strictEqual(diags.length, 0);
    });

    test('uses Hint severity (not Warning) to avoid spamming legacy components', () => {
        const text = [
            '{# @prop a:text #}',
            '{# @prop b:text #}',
            '{# @prop c:text #}',
        ].join('\n');
        const diags = checkMissingDescription(makeDoc(text), text);
        assert.strictEqual(diags.length, 3);
        for (const d of diags) {
            assert.strictEqual(d.severity, vscode.DiagnosticSeverity.Hint);
        }
    });

    test('range subraya el nombre del prop (no toda la línea)', () => {
        const text = '{# @prop title:text #}';
        const diags = checkMissingDescription(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        const r = diags[0].range;
        assert.strictEqual(r.start.character, text.indexOf('title'));
        assert.strictEqual(r.end.character, text.indexOf('title') + 'title'.length);
    });

    test('flags dynamic-prefixed prop names by their cleanName', () => {
        const text = '{# @prop :foo:text #}';
        const diags = checkMissingDescription(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        assert.ok(diags[0].message.includes("'foo'"));
    });

    test('respects existing filters on either side of the missing description', () => {
        const text = '{# @prop title:text | required | default:"x" #}';
        const diags = checkMissingDescription(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
    });
});

suite('Parity: missing-description severity setting', () => {
    const SETTING_KEY = 'diagnostics.missingDescription.severity';
    const text = '{# @prop title:text #}';

    async function setSeverity(value: string | undefined) {
        await vscode.workspace
            .getConfiguration('djangoCottonProps')
            .update(SETTING_KEY, value, vscode.ConfigurationTarget.Workspace);
    }

    suiteTeardown(async () => { await setSeverity(undefined); });

    test('"warning" promotes the diagnostic from Hint to Warning', async () => {
        await setSeverity('warning');
        const diags = checkMissingDescription(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Warning);
    });

    test('"off" disables the diagnostic entirely', async () => {
        await setSeverity('off');
        const diags = checkMissingDescription(makeDoc(text), text);
        assert.strictEqual(diags.length, 0);
    });

    test('"hint" (default) keeps Hint severity', async () => {
        await setSeverity('hint');
        const diags = checkMissingDescription(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Hint);
    });

    test('unrecognised values fall back to Hint', async () => {
        await setSeverity('error'); // not in the enum — defensive default
        const diags = checkMissingDescription(makeDoc(text), text);
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Hint);
    });
});
