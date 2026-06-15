import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { buildExcludeGlob, buildWatchGlob, isExcludedDir } from '../../core/scanner';
import { DEFAULT_EXCLUDE_SEGMENTS } from '../../core/constants';

suite('Config globs: buildExcludeGlob', () => {
    test('wraps segments into a findFiles brace glob', () => {
        assert.strictEqual(
            buildExcludeGlob(['node_modules', '.*']),
            '**/{node_modules,.*}/**',
        );
    });

    test('single segment still uses the brace form', () => {
        assert.strictEqual(buildExcludeGlob(['venv']), '**/{venv}/**');
    });
});

suite('Config globs: buildWatchGlob', () => {
    test('single path → **/<path>/**/*.html', () => {
        assert.strictEqual(buildWatchGlob(['templates/cotton']), '**/templates/cotton/**/*.html');
    });

    test('multiple paths → brace alternation', () => {
        assert.strictEqual(
            buildWatchGlob(['templates/cotton', 'myapp/ui']),
            '{**/templates/cotton/**/*.html,**/myapp/ui/**/*.html}',
        );
    });
});

suite('Config globs: isExcludedDir (sync walk parity)', () => {
    const segs = [...DEFAULT_EXCLUDE_SEGMENTS, 'templates/cotton/icons'];

    test('matches a plain directory name', () => {
        assert.strictEqual(isExcludedDir('node_modules', 'a/node_modules', segs), true);
        assert.strictEqual(isExcludedDir('__pycache__', 'x/y/__pycache__', segs), true);
    });

    test('".*" wildcard matches any dot-directory by name', () => {
        assert.strictEqual(isExcludedDir('.venv', 'foo/.venv', segs), true);
        assert.strictEqual(isExcludedDir('.git', '.git', segs), true);
    });

    test('a non-excluded directory is kept', () => {
        assert.strictEqual(isExcludedDir('components', 'templates/cotton/components', segs), false);
        assert.strictEqual(isExcludedDir('atoms', 'templates/cotton/atoms', segs), false);
    });

    test('multi-segment entry matches a path suffix, not just a name', () => {
        // The folder is named "icons" but only excluded under templates/cotton.
        assert.strictEqual(isExcludedDir('icons', 'templates/cotton/icons', segs), true);
        assert.strictEqual(isExcludedDir('icons', 'shop/templates/cotton/icons', segs), true);
        // A different "icons" elsewhere must survive.
        assert.strictEqual(isExcludedDir('icons', 'templates/cotton/atoms/icons', segs), false);
    });
});

suite('Config globs: default exclude actually excludes', () => {
    test('default segments drop dot-dirs and named build dirs in findFiles', async function () {
        this.timeout(20000);
        const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const base = path.join(root, '__cfg_glob_probe__');
        const made = [
            'keep/a.html',             // FOUND
            '.venv/b.html',            // dot-dir → excluded by ".*"
            '.mypy_cache/c.html',      // dot-dir → excluded by ".*"
            'node_modules/d.html',     // named → excluded
            '__pycache__/e.html',      // named → excluded
        ];
        for (const rel of made) {
            const fp = path.join(base, rel);
            fs.mkdirSync(path.dirname(fp), { recursive: true });
            fs.writeFileSync(fp, '<c-atoms.button />', 'utf-8');
        }
        try {
            const exclude = buildExcludeGlob([...DEFAULT_EXCLUDE_SEGMENTS]);
            const found = await vscode.workspace.findFiles('**/__cfg_glob_probe__/**/*.html', exclude);
            const names = found.map(u => path.relative(base, u.fsPath));
            assert.deepStrictEqual(names, ['keep/a.html'],
                `expected only keep/a.html, got: ${names.join(', ')}`);
        } finally {
            fs.rmSync(base, { recursive: true, force: true });
        }
    });
});
