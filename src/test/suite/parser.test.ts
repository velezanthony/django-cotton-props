import * as assert from 'assert';
import { parsePropFilters, parseProps, isStrictComponent } from '../../core/parser';

suite('parsePropFilters', () => {

    test('parses basic text prop', () => {
        const r = parsePropFilters('title:text | description:"Page title"');
        assert.ok(r);
        assert.strictEqual(r.name, 'title');
        assert.strictEqual(r.cleanName, 'title');
        assert.strictEqual(r.type, 'text');
        assert.strictEqual(r.description, 'Page title');
        assert.strictEqual(r.isDynamic, false);
        assert.strictEqual(r.required, false);
        assert.strictEqual(r.hasDefault, false);
    });

    test('parses select prop with options and default', () => {
        const r = parsePropFilters("variant:select['primary', 'secondary', 'danger'] | default:\"primary\" | description:\"Style variant\"");
        assert.ok(r);
        assert.strictEqual(r.name, 'variant');
        assert.strictEqual(r.type, 'select');
        assert.deepStrictEqual(r.options, ['primary', 'secondary', 'danger']);
        assert.strictEqual(r.defaultValue, 'primary');
        assert.strictEqual(r.hasDefault, true);
        assert.strictEqual(r.description, 'Style variant');
    });

    test('parses boolean prop with default', () => {
        const r = parsePropFilters('loading:boolean | default:False | description:"Show spinner"');
        assert.ok(r);
        assert.strictEqual(r.type, 'boolean');
        assert.strictEqual(r.defaultValue, 'False');
        assert.strictEqual(r.hasDefault, true);
    });

    test('parses number prop', () => {
        const r = parsePropFilters(':count:number | default:0 | description:"Number to display"');
        assert.ok(r);
        assert.strictEqual(r.name, ':count');
        assert.strictEqual(r.cleanName, 'count');
        assert.strictEqual(r.type, 'number');
        assert.strictEqual(r.isDynamic, true);
        assert.strictEqual(r.defaultValue, '0');
    });

    test('parses dynamic prop (: prefix)', () => {
        const r = parsePropFilters(':items:text | description:"Dynamic items"');
        assert.ok(r);
        assert.strictEqual(r.name, ':items');
        assert.strictEqual(r.cleanName, 'items');
        assert.strictEqual(r.isDynamic, true);
    });

    test('parses required prop', () => {
        const r = parsePropFilters('name:text | required | description:"User name"');
        assert.ok(r);
        assert.strictEqual(r.required, true);
        assert.strictEqual(r.hasDefault, false);
    });

    test('default overrides required', () => {
        const r = parsePropFilters('name:text | required | default:"fallback"');
        assert.ok(r);
        assert.strictEqual(r.required, false);
        assert.strictEqual(r.hasDefault, true);
        assert.strictEqual(r.defaultValue, 'fallback');
    });

    test('parses deprecated prop with message', () => {
        const r = parsePropFilters('old-color:text | deprecated:"Use variant instead"');
        assert.ok(r);
        assert.strictEqual(r.deprecated, 'Use variant instead');
    });

    test('parses deprecated prop without message', () => {
        const r = parsePropFilters('old-api:text | deprecated');
        assert.ok(r);
        assert.strictEqual(r.deprecated, '');
    });

    test('parses hidden prop', () => {
        const r = parsePropFilters('internal:text | hidden');
        assert.ok(r);
        assert.strictEqual(r.hidden, true);
    });

    test('parses example filter', () => {
        const r = parsePropFilters('color:text | example:"red"');
        assert.ok(r);
        assert.strictEqual(r.example, 'red');
    });

    test('unknown type falls back to text', () => {
        const r = parsePropFilters('field:unknown | description:"test"');
        assert.ok(r);
        assert.strictEqual(r.type, 'text');
    });

    test('returns null for invalid head format', () => {
        const r = parsePropFilters('invalid format without type');
        assert.strictEqual(r, null);
    });

    test('returns null for empty string', () => {
        const r = parsePropFilters('');
        assert.strictEqual(r, null);
    });

    test('select with no options returns empty array', () => {
        const r = parsePropFilters('mode:select | default:"auto"');
        assert.ok(r);
        assert.strictEqual(r.type, 'select');
        assert.deepStrictEqual(r.options, []);
    });

    test('all filters combined', () => {
        const r = parsePropFilters('field:text | default:"hello" | description:"A field" | example:"world" | hidden');
        assert.ok(r);
        assert.strictEqual(r.defaultValue, 'hello');
        assert.strictEqual(r.description, 'A field');
        assert.strictEqual(r.example, 'world');
        assert.strictEqual(r.hidden, true);
        assert.strictEqual(r.hasDefault, true);
    });
});

suite('parseProps', () => {

    test('parses @prop annotations from content', () => {
        const content = `
{# @prop title:text | description:"Title" #}
{# @prop variant:select['a', 'b'] | default:"a" #}
<c-vars title="" variant="a" />
<div>{{ title }}</div>`;
        const props = parseProps(content);
        assert.strictEqual(props.length, 2);
        assert.strictEqual(props[0].name, 'title');
        assert.strictEqual(props[1].name, 'variant');
        assert.strictEqual(props[1].type, 'select');
    });

    test('falls back to c-vars when no @prop annotations', () => {
        const content = '<c-vars title="" :count="0" active="False" />\n<div>{{ title }}</div>';
        const props = parseProps(content);
        assert.strictEqual(props.length, 3);
        assert.strictEqual(props[0].name, 'title');
        assert.strictEqual(props[0].type, 'text');
        assert.strictEqual(props[1].name, ':count');
        assert.strictEqual(props[1].isDynamic, true);
        assert.strictEqual(props[2].name, 'active');
        assert.strictEqual(props[2].defaultValue, 'False');
    });

    test('c-vars fallback detects defaults', () => {
        const content = '<c-vars color="blue" bare />';
        const props = parseProps(content);
        const color = props.find(p => p.name === 'color');
        const bare = props.find(p => p.name === 'bare');
        assert.ok(color);
        assert.strictEqual(color.hasDefault, true);
        assert.strictEqual(color.defaultValue, 'blue');
        assert.ok(bare);
        assert.strictEqual(bare.hasDefault, false);
    });

    test('prefers @prop over c-vars fallback', () => {
        const content = `{# @prop title:text | description:"documented" #}\n<c-vars title="" extra="" />`;
        const props = parseProps(content);
        assert.strictEqual(props.length, 1);
        assert.strictEqual(props[0].description, 'documented');
    });

    test('returns empty for content without props', () => {
        const content = '<div>Hello world</div>';
        const props = parseProps(content);
        assert.strictEqual(props.length, 0);
    });

    test('handles empty content', () => {
        const props = parseProps('');
        assert.strictEqual(props.length, 0);
    });
});

suite('isStrictComponent', () => {

    test('returns true when @strict is present', () => {
        assert.strictEqual(isStrictComponent('{# @strict #}\n<c-vars />'), true);
    });

    test('returns false when @strict is absent', () => {
        assert.strictEqual(isStrictComponent('{# @prop title:text #}\n<c-vars title="" />'), false);
    });

    test('returns false for empty content', () => {
        assert.strictEqual(isStrictComponent(''), false);
    });

    test('handles @strict with extra whitespace', () => {
        assert.strictEqual(isStrictComponent('{#   @strict   #}'), true);
    });
});
