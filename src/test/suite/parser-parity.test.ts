import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseComponent, parseProps } from '../../core/parser';

// Fixture: every supported Cotton annotation, syntactically clean per the
// canonical regexes in django-cotton-gallery (`core/annotations.py`).
//
// Source of truth — when the gallery's parser changes, this fixture and the
// asserts below must move with it. The extension's parser must produce the
// same result the gallery does.
// Compiled location: out/test/suite/parser-parity.test.js. The fixture is a
// raw .html file, not copied by tsc — read it from src/test/fixtures/.
const FIXTURE_PATH = path.resolve(
    __dirname,
    '..', '..', '..',
    'src', 'test', 'fixtures', 'all-annotations.html',
);
const FIXTURE = fs.readFileSync(FIXTURE_PATH, 'utf-8');

suite('Parser Parity (django-cotton-gallery canon)', () => {

    // ── @prop annotations — already supported by the extension ──

    suite('@prop', () => {
        const props = parseProps(FIXTURE);

        test('extracts 5 @prop blocks from the fixture', () => {
            assert.strictEqual(props.length, 5);
        });

        test('title — required text prop with description', () => {
            const p = props.find(x => x.cleanName === 'title');
            assert.ok(p, 'title prop missing');
            assert.strictEqual(p!.type, 'text');
            assert.strictEqual(p!.required, true);
            assert.strictEqual(p!.hasDefault, false);
            assert.strictEqual(p!.description, 'Page title');
            assert.strictEqual(p!.isDynamic, false);
        });

        test('count — number prop with default 0', () => {
            const p = props.find(x => x.cleanName === 'count');
            assert.ok(p, 'count prop missing');
            assert.strictEqual(p!.type, 'number');
            assert.strictEqual(p!.hasDefault, true);
            assert.strictEqual(p!.defaultValue, '0');
            assert.strictEqual(p!.description, 'Item count');
        });

        test('variant — select prop with options + default', () => {
            const p = props.find(x => x.cleanName === 'variant');
            assert.ok(p, 'variant prop missing');
            assert.strictEqual(p!.type, 'select');
            assert.deepStrictEqual(p!.options, ['primary', 'secondary', 'ghost']);
            assert.strictEqual(p!.defaultValue, 'primary');
            assert.strictEqual(p!.description, 'Visual style');
        });

        test('is_active — boolean prop with default True', () => {
            const p = props.find(x => x.cleanName === 'is_active');
            assert.ok(p, 'is_active prop missing');
            assert.strictEqual(p!.type, 'boolean');
            assert.strictEqual(p!.hasDefault, true);
            // Extension keeps the raw token; gallery coerces via TRUTHY_TOKENS.
            // Boolean coercion alignment is Tier 4 (see PLAN.md). Until then,
            // assert raw-string parity with the source.
            assert.strictEqual(p!.defaultValue, 'True');
            assert.strictEqual(p!.description, 'Active state');
        });

        test(':dynamic_attr — dynamic-prefix text prop', () => {
            const p = props.find(x => x.cleanName === 'dynamic_attr');
            assert.ok(p, 'dynamic_attr prop missing');
            assert.strictEqual(p!.name, ':dynamic_attr');
            assert.strictEqual(p!.isDynamic, true);
            assert.strictEqual(p!.type, 'text');
            assert.strictEqual(p!.description, 'Dynamic-prefix prop');
        });
    });

    // ── @description — Phase 1.1 ──

    suite('@description', () => {
        test('extracts {# @description ... #} as component description', () => {
            const result = parseComponent(FIXTURE);
            assert.strictEqual(
                result.description,
                'Component that exercises every supported annotation.',
            );
        });

        test('returns empty string when no @description block', () => {
            assert.strictEqual(parseComponent('{# @prop x:text #}').description, '');
        });

        test('first @description wins when multiple exist', () => {
            const src = '{# @description First. #}\n{# @description Second. #}';
            assert.strictEqual(parseComponent(src).description, 'First.');
        });

        test('trims surrounding whitespace', () => {
            assert.strictEqual(
                parseComponent('{# @description    Padded.    #}').description,
                'Padded.',
            );
        });
    });

    // ── @slot / @slot:NAME — Phase 1.2 + 1.3 ──

    suite('@slot', () => {
        const result = parseComponent(FIXTURE);

        test('extracts 3 slots from the fixture', () => {
            assert.strictEqual(result.slots.length, 3);
        });

        test('parses default slot with description (body starts with —)', () => {
            const def = result.slots.find(s => s.name === null);
            assert.ok(def, 'default slot missing');
            assert.strictEqual(def!.description, 'Default content area.');
            assert.strictEqual(def!.content, '');
        });

        test('parses named slot @slot:header with description', () => {
            const header = result.slots.find(s => s.name === 'header');
            assert.ok(header, 'header slot missing');
            assert.strictEqual(header!.description, 'Header slot for custom content.');
            assert.strictEqual(header!.content, '');
        });

        test('parses bare named slot @slot:footer (no description, no content)', () => {
            const footer = result.slots.find(s => s.name === 'footer');
            assert.ok(footer, 'footer slot missing');
            assert.strictEqual(footer!.description, '');
            assert.strictEqual(footer!.content, '');
        });

        test('splits content/description on " — " when body has both', () => {
            const slots = parseComponent('{# @slot <button>Open</button> — Trigger button #}').slots;
            assert.strictEqual(slots.length, 1);
            assert.strictEqual(slots[0].name, null);
            assert.strictEqual(slots[0].content, '<button>Open</button>');
            assert.strictEqual(slots[0].description, 'Trigger button');
        });

        test('content-only slot has empty description', () => {
            const slots = parseComponent('{# @slot:cta <a>Click</a> #}').slots;
            assert.strictEqual(slots[0].name, 'cta');
            assert.strictEqual(slots[0].content, '<a>Click</a>');
            assert.strictEqual(slots[0].description, '');
        });
    });

    // ── @trigger — Phase 1.4 ──

    suite('@trigger', () => {
        test('extracts trigger HTML content', () => {
            const result = parseComponent(FIXTURE);
            assert.strictEqual(result.trigger, '<button>Open</button>');
        });

        test('returns empty string when no @trigger block', () => {
            assert.strictEqual(parseComponent('{# @prop x:text #}').trigger, '');
        });

        test('strips trailing description after " — "', () => {
            const src = '{# @trigger <a>Click</a> — Opens drawer #}';
            assert.strictEqual(parseComponent(src).trigger, '<a>Click</a>');
        });

        test('returns content as-is when no description suffix', () => {
            const src = '{# @trigger <button class="cta">Open</button> #}';
            assert.strictEqual(parseComponent(src).trigger, '<button class="cta">Open</button>');
        });
    });

    // ── <c-vars> dual-pass parsing — Phase 1.5 (CRITICAL FIX) ──
    //
    // Today the extension short-circuits: `if (props.length > 0) return props`
    // — so when @prop blocks exist, <c-vars> is never read. Gallery parses
    // BOTH always. The fix re-enables c-vars parsing as a separate pass,
    // and along the way handles:
    //   - <c-vars />  (self-closing, no attrs)
    //   - <c-vars/>   (no whitespace)
    //   - <c-vars>    (no attrs at all)
    //   - <c-vars> mentions inside {# ... #} comments must NOT shadow real one
    suite('<c-vars> dual-pass', () => {
        test('parses 5 attrs from <c-vars> even when @prop blocks exist', () => {
            const result = parseComponent(FIXTURE);
            assert.ok(result.cvars, 'cvars block missing');
            assert.strictEqual(result.cvars!.attrs.length, 5);
            const names = result.cvars!.attrs.map(a => a.cleanName);
            assert.deepStrictEqual(names, ['title', 'count', 'variant', 'is_active', 'dynamic_attr']);
        });

        test('preserves dynamic prefix on <c-vars> attrs', () => {
            const result = parseComponent(FIXTURE);
            const dyn = result.cvars!.attrs.find(a => a.cleanName === 'dynamic_attr');
            assert.ok(dyn);
            assert.strictEqual(dyn!.dynamic, true);
            assert.strictEqual(dyn!.hasValue, false);
            assert.strictEqual(dyn!.name, ':dynamic_attr');
        });

        test('handles self-closing <c-vars /> with no attrs', () => {
            const result = parseComponent('<c-vars />');
            assert.ok(result.cvars);
            assert.strictEqual(result.cvars!.attrs.length, 0);
        });

        test('handles <c-vars/> with no whitespace before slash', () => {
            const result = parseComponent('<c-vars/>');
            assert.ok(result.cvars);
            assert.strictEqual(result.cvars!.attrs.length, 0);
        });

        test('handles bare <c-vars> with no attrs and no self-close', () => {
            const result = parseComponent('<c-vars></c-vars>');
            assert.ok(result.cvars);
            assert.strictEqual(result.cvars!.attrs.length, 0);
        });

        test('ignores <c-vars> appearing inside Django {# ... #} comment', () => {
            const src = '{# fake: <c-vars stale="x" /> #}\n<c-vars real="y" />';
            const result = parseComponent(src);
            assert.ok(result.cvars);
            const names = result.cvars!.attrs.map(a => a.cleanName);
            assert.deepStrictEqual(names, ['real']);
        });

        test('captures unquoted attribute values like is_active=True', () => {
            const result = parseComponent(FIXTURE);
            const isActive = result.cvars!.attrs.find(a => a.cleanName === 'is_active');
            assert.ok(isActive);
            assert.strictEqual(isActive!.hasValue, true);
            assert.strictEqual(isActive!.value, 'True');
        });

        test('captures double-quoted values', () => {
            const result = parseComponent(FIXTURE);
            const variant = result.cvars!.attrs.find(a => a.cleanName === 'variant');
            assert.ok(variant);
            assert.strictEqual(variant!.value, 'primary');
        });

        test('returns null when no <c-vars> tag in source', () => {
            const result = parseComponent('{# @prop x:text #}\n<div>hi</div>');
            assert.strictEqual(result.cvars, null);
        });
    });

    // ── accepts_attrs — Phase 1 (low priority extension to ParsedComponent) ──

    suite('accepts_attrs', () => {
        test('detects {{ attrs }} interpolation', () => {
            assert.strictEqual(parseComponent('<div {{ attrs }}></div>').acceptsAttrs, true);
        });

        test('detects :attrs="attrs" pass-through', () => {
            assert.strictEqual(parseComponent('<div :attrs="attrs"></div>').acceptsAttrs, true);
        });

        test('detects attrs="attrs" pass-through (no dynamic prefix)', () => {
            assert.strictEqual(parseComponent('<div attrs="attrs"></div>').acceptsAttrs, true);
        });

        test('returns false for templates without an attrs forward', () => {
            assert.strictEqual(parseComponent('<div>{{ title }}</div>').acceptsAttrs, false);
        });

        test('fixture has no attrs forward → false', () => {
            assert.strictEqual(parseComponent(FIXTURE).acceptsAttrs, false);
        });
    });
});
