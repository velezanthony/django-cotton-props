import * as assert from 'assert';
import { formatPropSummary, formatPropDocs } from '../../core/formatting';
import type { PropDefinition } from '../../core/models';

// ── Helpers ──

function makeProp(overrides: Partial<PropDefinition> = {}): PropDefinition {
    return {
        name: 'title',
        cleanName: 'title',
        type: 'text',
        options: [],
        defaultValue: '',
        hasDefault: false,
        description: '',
        isDynamic: false,
        required: false,
        hidden: false,
        example: '',
        ...overrides,
    };
}

// ── formatPropSummary ──

suite('formatPropSummary', () => {

    test('text prop with description and default', () => {
        const result = formatPropSummary(makeProp({
            cleanName: 'label',
            type: 'text',
            description: 'Button label',
            hasDefault: true,
            defaultValue: 'Click me',
        }));
        assert.ok(result.includes('`label`'), 'Should include prop name');
        assert.ok(result.includes('*text*'), 'Should include type');
        assert.ok(result.includes('default `Click me`'), 'Should label default value');
        assert.ok(result.includes('_Button label_'), 'Should render description in italics');
    });

    test('select prop shows options and marks default', () => {
        const result = formatPropSummary(makeProp({
            cleanName: 'variant',
            type: 'select',
            options: ['primary', 'secondary', 'danger'],
            defaultValue: 'primary',
            hasDefault: true,
            description: 'Style variant',
        }));
        assert.ok(result.includes('`variant`'), 'Should include prop name');
        assert.ok(result.includes('_Style variant_'), 'Should render description in italics');
        assert.ok(result.includes('**Options:**'), 'Should label the options row');
        assert.ok(result.includes('`primary` *(default)*'), 'Should mark default option');
        assert.ok(result.includes('`secondary`'), 'Should list other options');
        assert.ok(result.includes('`danger`'), 'Should list all options');
        assert.ok(!result.includes('`secondary` *(default)*'), 'Should not mark non-default as default');
    });

    test('blocks separate head, description, and options with soft breaks', () => {
        // Soft-break is two spaces + newline. Hover renders each on its own line.
        const result = formatPropSummary(makeProp({
            cleanName: 'variant',
            type: 'select',
            options: ['a', 'b'],
            defaultValue: 'a',
            hasDefault: true,
            description: 'X',
        }));
        assert.ok(result.includes('  \n'), 'Should use soft breaks between lines');
        const lines = result.split('  \n');
        assert.strictEqual(lines.length, 3, `Expected head + description + options, got: ${JSON.stringify(lines)}`);
    });

    test('required prop shows **required** badge', () => {
        const result = formatPropSummary(makeProp({
            cleanName: 'name',
            type: 'text',
            required: true,
        }));
        assert.ok(result.includes('**required**'), 'Should include required badge');
    });

    test('deprecated prop shows ~~deprecated~~ badge', () => {
        const result = formatPropSummary(makeProp({
            cleanName: 'old-api',
            type: 'text',
            deprecated: 'Use new-api instead',
        }));
        assert.ok(result.includes('~~deprecated~~'), 'Should include deprecated badge');
    });

    test('hidden prop shows *hidden* badge', () => {
        const result = formatPropSummary(makeProp({
            cleanName: 'internal',
            type: 'text',
            hidden: true,
        }));
        assert.ok(result.includes('*hidden*'), 'Should include hidden badge');
    });
});

// ── formatPropDocs ──

suite('formatPropDocs', () => {

    test('complete prop with all fields', () => {
        const md = formatPropDocs(makeProp({
            cleanName: 'variant',
            type: 'select',
            description: 'Style variant',
            hasDefault: true,
            defaultValue: 'primary',
            options: ['primary', 'secondary', 'danger'],
            required: true,
            example: 'variant="danger"',
        }));
        const text = md.value;
        assert.ok(text.includes('**variant** — `select`'), 'Should include header with name and type');
        assert.ok(text.includes('*(required)*'), 'Should include required badge');
        assert.ok(text.includes('Style variant'), 'Should include description');
        assert.ok(text.includes('**Default:** `primary`'), 'Should include default');
        assert.ok(text.includes('**Values:**'), 'Should include values section');
        assert.ok(text.includes('`primary` *(default)*'), 'Should mark default in options');
        assert.ok(text.includes('**Example:** `variant="danger"`'), 'Should include example');
    });

    test('isDynamic=true shows dynamic explanation', () => {
        const md = formatPropDocs(makeProp({
            cleanName: 'items',
            type: 'text',
        }), true);
        const text = md.value;
        assert.ok(text.includes('**`:prop`**'), 'Should include dynamic prop marker');
        assert.ok(text.includes('Django template variable'), 'Should explain dynamic usage');
    });

    test('deprecated prop with message shows deprecation warning', () => {
        const md = formatPropDocs(makeProp({
            cleanName: 'old-color',
            type: 'text',
            deprecated: 'Use variant instead',
        }));
        const text = md.value;
        assert.ok(text.includes('*(deprecated)*'), 'Should include deprecated badge');
        assert.ok(text.includes('⚠️ **Deprecated:** Use variant instead'), 'Should include deprecation message');
    });
});
