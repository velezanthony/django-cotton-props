import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { scanComponents, prewarmScanCache, invalidateScanCache } from '../../core/scanner';

// The scanner must discover components at ANY depth (Django APP_DIRS), not just
// at the workspace-root `templates/cotton`. Discovery goes through findFiles +
// filePathToTag, mirroring the file watcher's glob.

suite('Multi-app component discovery', () => {
    test('finds components in a nested app templates/cotton dir', async function () {
        this.timeout(20000);
        const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
        // Nested like `shop/templates/cotton/...` — NOT at the workspace root.
        const appDir = path.join(root, 'shop_app', 'templates', 'cotton', 'widgets');
        const file = path.join(appDir, 'price-tag.html');
        fs.mkdirSync(appDir, { recursive: true });
        fs.writeFileSync(file, '{# @prop amount:number #}\n<span>{{ amount }}</span>', 'utf-8');

        try {
            invalidateScanCache();
            await prewarmScanCache();
            const tags = scanComponents().map(c => c.tag);

            // Tag is relative to the `templates/cotton` suffix → `widgets.price-tag`.
            assert.ok(tags.includes('widgets.price-tag'),
                `expected nested app component 'widgets.price-tag', got: ${tags.join(', ')}`);
        } finally {
            fs.rmSync(path.join(root, 'shop_app'), { recursive: true, force: true });
            invalidateScanCache();
            await prewarmScanCache();
        }
    });

    test('still finds the root-level components', async function () {
        this.timeout(20000);
        invalidateScanCache();
        await prewarmScanCache();
        const tags = scanComponents().map(c => c.tag);
        // atoms.button is a known root fixture in test-django-cotton.
        assert.ok(tags.includes('atoms.button'),
            `expected root component 'atoms.button', got ${tags.length} components`);
    });
});
