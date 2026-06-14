import * as assert from 'assert';
import * as vscode from 'vscode';
import { scanComponents, findComponentFile, filePathToTag, isCottonFile } from '../../core/scanner';

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
