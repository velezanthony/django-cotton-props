import * as assert from 'assert';
import { shouldRetriggerTagCompletion } from '../../core/helpers/retrigger';

// The bug: once the tag-completion popup has CLOSED (accept, `>`, Escape...),
// deleting a character to edit a `<c-...` tag name never reopens it, because
// VS Code only auto-triggers completion on the `<` trigger char or while
// TYPING — never on deletion. This decides when to re-open it.
suite('shouldRetriggerTagCompletion (re-open tag popup after delete)', () => {

    test('deletion leaving a partial <c- tag re-triggers', () => {
        assert.strictEqual(shouldRetriggerTagCompletion('<c-atoms.butto', true), true);
    });

    test('deletion down to a bare <c re-triggers', () => {
        assert.strictEqual(shouldRetriggerTagCompletion('<c', true), true);
    });

    test('insertion does NOT re-trigger (typing already triggers natively)', () => {
        assert.strictEqual(shouldRetriggerTagCompletion('<c-atoms.butto', false), false);
    });

    test('deletion on a non-cotton tag does NOT re-trigger', () => {
        assert.strictEqual(shouldRetriggerTagCompletion('<div', true), false);
    });

    test('deletion inside an attribute value does NOT re-trigger', () => {
        assert.strictEqual(shouldRetriggerTagCompletion('<c-atoms.button variant="<c', true), false);
    });

    test('deletion in plain prose does NOT re-trigger', () => {
        assert.strictEqual(shouldRetriggerTagCompletion('hello world', true), false);
    });
});
