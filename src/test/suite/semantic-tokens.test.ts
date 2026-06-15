import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    CottonSemanticTokenProvider,
    SEMANTIC_LEGEND,
} from '../../core/providers/semantic-tokens';

// ── Helpers ──

interface DecodedToken {
    line: number;
    char: number;
    length: number;
    /** Human-readable token type from the legend ('comment' | 'keyword' | 'variable' | 'string'). */
    type: string;
    /** The actual source text the token covers. */
    text: string;
}

/**
 * Decode the VS Code semantic-tokens wire format (flat Uint32Array of
 * `[deltaLine, deltaChar, length, typeIdx, modifiers]` quintuples) back into
 * absolute, human-readable tokens so tests can assert on them directly.
 */
function decode(tokens: vscode.SemanticTokens, doc: vscode.TextDocument): DecodedToken[] {
    const out: DecodedToken[] = [];
    const data = tokens.data;
    let line = 0;
    let char = 0;
    for (let i = 0; i < data.length; i += 5) {
        const deltaLine = data[i];
        const deltaChar = data[i + 1];
        const length = data[i + 2];
        const typeIdx = data[i + 3];

        line += deltaLine;
        char = deltaLine === 0 ? char + deltaChar : deltaChar;

        const start = new vscode.Position(line, char);
        const range = new vscode.Range(start, start.translate(0, length));
        out.push({
            line,
            char,
            length,
            type: SEMANTIC_LEGEND.tokenTypes[typeIdx],
            text: doc.getText(range),
        });
    }
    return out;
}

async function tokenize(content: string): Promise<{ tokens: DecodedToken[]; doc: vscode.TextDocument }> {
    const doc = await vscode.workspace.openTextDocument({ content, language: 'html' });
    const provider = new CottonSemanticTokenProvider();
    const raw = provider.provideDocumentSemanticTokens(doc);
    return { tokens: decode(raw, doc), doc };
}

/** All tokens of a given type. */
function ofType(tokens: DecodedToken[], type: string): DecodedToken[] {
    return tokens.filter(t => t.type === type);
}

/** True if some token of `type` covers exactly `text`. */
function has(tokens: DecodedToken[], type: string, text: string): boolean {
    return tokens.some(t => t.type === type && t.text === text);
}

// ── Tests ──

suite('CottonSemanticTokenProvider', () => {

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    suite('@prop annotations', () => {

        test('tints the {# and #} delimiters as comment', async () => {
            const { tokens } = await tokenize('{# @prop title:text #}');
            const comments = ofType(tokens, 'comment').map(t => t.text);
            assert.ok(comments.includes('{#'), `expected '{#' comment token, got ${JSON.stringify(comments)}`);
            assert.ok(comments.includes('#}'), `expected '#}' comment token, got ${JSON.stringify(comments)}`);
        });

        test('tints @prop as a keyword (including the @)', async () => {
            const { tokens } = await tokenize('{# @prop title:text #}');
            assert.ok(has(tokens, 'keyword', '@prop'), 'expected @prop keyword token');
        });

        test('tints the prop name as a variable', async () => {
            const { tokens } = await tokenize('{# @prop title:text #}');
            assert.ok(has(tokens, 'variable', 'title'), 'expected prop name as variable');
        });

        test('tints the prop type as a string', async () => {
            const { tokens } = await tokenize('{# @prop title:text #}');
            assert.ok(has(tokens, 'string', 'text'), 'expected prop type as string');
        });

        test('tints select option list as a string', async () => {
            const { tokens } = await tokenize("{# @prop variant:select['a','b'] #}");
            assert.ok(has(tokens, 'string', "['a','b']"), 'expected select options as string');
        });

        test('tints the filter pipe, filter name and quoted value', async () => {
            const { tokens } = await tokenize('{# @prop title:text | default:"hi" #}');
            assert.ok(has(tokens, 'comment', '|'), 'expected pipe as comment token');
            assert.ok(has(tokens, 'variable', 'default'), 'expected filter name as variable');
            assert.ok(has(tokens, 'string', '"hi"'), 'expected quoted filter value (with quotes) as string');
        });

        test('tints an unquoted filter value (False) as a string', async () => {
            const { tokens } = await tokenize('{# @prop loading:boolean | default:False #}');
            assert.ok(has(tokens, 'string', 'False'), 'expected unquoted value as string');
        });

        test('handles a dynamic-prefix prop name (:foo)', async () => {
            const { tokens } = await tokenize('{# @prop :foo:text #}');
            assert.ok(has(tokens, 'variable', ':foo'), 'expected colon-prefixed prop name as variable');
        });
    });

    suite('@slot / @trigger / @strict', () => {

        test('tints @slot description as a string', async () => {
            const { tokens } = await tokenize('{# @slot header — the page header #}');
            assert.ok(has(tokens, 'keyword', '@slot'), 'expected @slot keyword');
            assert.ok(has(tokens, 'string', 'header — the page header'), 'expected slot content as string');
        });

        test('tints @trigger as a keyword', async () => {
            const { tokens } = await tokenize('{# @trigger — opens the modal #}');
            assert.ok(has(tokens, 'keyword', '@trigger'), 'expected @trigger keyword');
        });

        test('@strict gets a keyword token and emits no body tokens', async () => {
            const { tokens } = await tokenize('{# @strict #}');
            assert.ok(has(tokens, 'keyword', '@strict'), 'expected @strict keyword');
            // Only {# , @strict, #} — no variable/string body tokens.
            assert.strictEqual(ofType(tokens, 'variable').length, 0);
            assert.strictEqual(ofType(tokens, 'string').length, 0);
        });
    });

    suite('cotton tag references', () => {

        test('tints a <c-...> tag name as a keyword', async () => {
            const { tokens } = await tokenize('<c-atoms.button variant="primary" />');
            assert.ok(has(tokens, 'keyword', 'c-atoms.button'), 'expected the tag name as a keyword token');
        });

        test('tints the closing </c-...> tag name too', async () => {
            const { tokens } = await tokenize('<c-atoms.button>x</c-atoms.button>');
            const tagKeywords = ofType(tokens, 'keyword').filter(t => t.text === 'c-atoms.button');
            assert.strictEqual(tagKeywords.length, 2, 'expected both open and close tag names tinted');
        });
    });

    suite('dynamic :attr values', () => {

        test('tints a dynamic :attr value as a variable', async () => {
            const { tokens } = await tokenize('<c-atoms.button :size="big" />');
            assert.ok(has(tokens, 'variable', 'big'), 'expected dynamic attr value tinted as a variable');
        });

        test('does NOT tint a static (non-colon) attr value', async () => {
            const { tokens } = await tokenize('<c-atoms.button size="md" />');
            assert.ok(!has(tokens, 'variable', 'md'), 'static attr value must not be tinted as a variable');
        });
    });

    test('empty document yields no tokens', async () => {
        const { tokens } = await tokenize('');
        assert.strictEqual(tokens.length, 0);
    });

    test('plain HTML with no cotton syntax yields no tokens', async () => {
        const { tokens } = await tokenize('<div class="x">hello</div>');
        assert.strictEqual(tokens.length, 0);
    });

    test('an unterminated annotation block is skipped (no #})', async () => {
        const { tokens } = await tokenize('{# @prop title:text');
        assert.strictEqual(tokens.length, 0, 'unterminated block must not emit tokens');
    });
});
