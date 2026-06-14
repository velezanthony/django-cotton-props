import * as assert from 'assert';
import { isFileNotFound } from '../../core/helpers/fileErrors';

// A missing file is an expected race (a component deleted/renamed/moved mid-flight),
// told apart from real I/O failures so only the latter get logged.
suite('isFileNotFound', () => {

    test("Node's ENOENT counts as not-found", () => {
        assert.strictEqual(isFileNotFound({ code: 'ENOENT' }), true);
    });

    test("VS Code's FileNotFound counts as not-found", () => {
        assert.strictEqual(isFileNotFound({ code: 'FileNotFound' }), true);
    });

    test('a real failure (e.g. EISDIR) is NOT not-found', () => {
        assert.strictEqual(isFileNotFound({ code: 'EISDIR' }), false);
    });

    test('an error with no usable code is NOT not-found', () => {
        assert.strictEqual(isFileNotFound(new Error('boom')), false);
        assert.strictEqual(isFileNotFound(null), false);
    });
});
