import * as assert from 'assert';
import * as vscode from 'vscode';
import { scanComponents, findComponentFile, filePathToTag, isCottonFile, getCachedComponent } from '../../core/scanner';

suite('Scanner', () => {

    test('scanComponents finds real project components', () => {
        const components = scanComponents();
        assert.ok(components.length >= 10, `Should find the fixture components, got ${components.length}`);

        const tags = components.map(c => c.tag);
        assert.ok(tags.includes('atoms.button'), 'Should find atoms.button');
        assert.ok(tags.includes('atoms.badge'), 'Should find atoms.badge');
        assert.ok(tags.includes('atoms.alert'), 'Should find atoms.alert');
        assert.ok(tags.includes('atoms.icon'), 'Should find atoms.icon');
        assert.ok(tags.includes('molecules.sidebar'), 'Should find molecules.sidebar');
    });

    test('scanComponents discovers all categories', () => {
        const components = scanComponents();
        const tags = components.map(c => c.tag);

        const hasAtoms = tags.some(t => t.startsWith('atoms.'));
        const hasMolecules = tags.some(t => t.startsWith('molecules.'));
        const hasIcons = tags.some(t => t.startsWith('icons.'));
        const hasTest = tags.some(t => t.startsWith('test.'));

        assert.ok(hasAtoms, 'Should find atoms');
        assert.ok(hasMolecules, 'Should find molecules');
        assert.ok(hasIcons, 'Should find icons');
        assert.ok(hasTest, 'Should find test components');
    });

    test('scanComponents returns filePath for each component', () => {
        const components = scanComponents();
        for (const comp of components) {
            assert.ok(comp.filePath.endsWith('.html'), `${comp.tag} should have .html path`);
            assert.ok(comp.filePath.includes('templates/cotton/'), `${comp.tag} path should include templates/cotton/`);
        }
    });

    test('findComponentFile resolves a known tag', () => {
        const filePath = findComponentFile('atoms.button');
        assert.ok(filePath, 'Should find atoms.button');
        assert.ok(filePath!.endsWith('button.html'));
    });

    test('findComponentFile resolves kebab-case tags', () => {
        const filePath = findComponentFile('atoms.date-picker');
        assert.ok(filePath, 'Should find atoms.date-picker');
    });

    test('findComponentFile returns undefined for unknown tag', () => {
        const filePath = findComponentFile('atoms.nonexistent');
        assert.strictEqual(filePath, undefined);
    });

    test('filePathToTag converts path to dot-notation tag', () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder, 'Workspace folder should be available');

        const testPath = folder.uri.fsPath + '/templates/cotton/atoms/button.html';
        const tag = filePathToTag(testPath);
        assert.strictEqual(tag, 'atoms.button');
    });

    test('filePathToTag returns undefined for non-cotton path', () => {
        const tag = filePathToTag('/some/random/path.html');
        assert.strictEqual(tag, undefined);
    });

    test('isCottonFile identifies cotton component paths', () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const uri = vscode.Uri.file(folder.uri.fsPath + '/templates/cotton/atoms/button.html');
        assert.strictEqual(isCottonFile(uri), true);
    });

    test('isCottonFile rejects non-cotton paths', () => {
        const uri = vscode.Uri.file('/tmp/random.html');
        assert.strictEqual(isCottonFile(uri), false);
    });
});

suite('getCached error model', () => {
    /** Replace console.error with a recorder; returns the calls + a restore fn. */
    function spyConsoleError() {
        const original = console.error;
        const calls: unknown[][] = [];
        console.error = (...args: unknown[]) => { calls.push(args); };
        return { calls, restore: () => { console.error = original; } };
    }

    test('a MISSING component file is handled quietly (no error log)', () => {
        const spy = spyConsoleError();
        try {
            const result = getCachedComponent('/no/such/dir/missing-component.html');
            assert.strictEqual(result.props.length, 0, 'a missing file yields an empty component');
        } finally {
            spy.restore();
        }
        assert.strictEqual(spy.calls.length, 0,
            `a missing file is an expected race and must not be logged, got: ${JSON.stringify(spy.calls)}`);
    });

    // The inverse — a genuine (non-not-found) error IS still logged — is covered by
    // the isFileNotFound unit tests plus the literal `if (!isFileNotFound) log`. An
    // integration test for it was flaky: background activity races getCached's stat cache.
});
