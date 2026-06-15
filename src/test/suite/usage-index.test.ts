import * as assert from 'assert';
import * as vscode from 'vscode';
import { UsageIndex } from '../../core/usage-index';

suite('UsageIndex', () => {
    let index: UsageIndex;

    suiteSetup(async function () {
        this.timeout(15000);
        index = new UsageIndex();
        await index.ready;
    });

    // ── getUsage ──

    test('getUsage returns count > 0 for a component used in the workspace', function () {
        this.timeout(10000);
        // atoms.button is used in valid-usage.html, invalid-usage.html, etc.
        const usage = index.getUsage('atoms.button');
        assert.ok(usage.total > 0, `Expected atoms.button total > 0, got ${usage.total}`);
        assert.ok(usage.fileCount > 0, `Expected atoms.button fileCount > 0, got ${usage.fileCount}`);
    });

    test('getUsage returns { total: 0, fileCount: 0 } for a nonexistent tag', function () {
        const usage = index.getUsage('atoms.this-does-not-exist-anywhere');
        assert.strictEqual(usage.total, 0, 'Nonexistent tag should have total 0');
        assert.strictEqual(usage.fileCount, 0, 'Nonexistent tag should have fileCount 0');
    });

    test('getUsage counts multiple occurrences across files', function () {
        this.timeout(10000);
        // atoms.button appears in multiple pages
        const usage = index.getUsage('atoms.button');
        assert.ok(usage.fileCount >= 2, `Expected atoms.button in at least 2 files, got ${usage.fileCount}`);
    });

    // ── getFilePaths ──

    test('getFilePaths returns file paths for a used component', function () {
        this.timeout(10000);
        const paths = index.getFilePaths('atoms.button');
        assert.ok(paths.length > 0, 'Should return at least one file path');
        for (const p of paths) {
            assert.ok(p.endsWith('.html'), `Path should be an HTML file: ${p}`);
        }
    });

    test('getFilePaths returns empty array for nonexistent tag', function () {
        const paths = index.getFilePaths('atoms.this-does-not-exist-anywhere');
        assert.strictEqual(paths.length, 0, 'Nonexistent tag should have no file paths');
    });

    test('getFilePaths includes valid-usage.html for atoms.badge', function () {
        this.timeout(10000);
        const paths = index.getFilePaths('atoms.badge');
        const hasValidUsage = paths.some(p => p.includes('valid-usage.html'));
        assert.ok(hasValidUsage, 'atoms.badge paths should include valid-usage.html');
    });

    // ── updateFile ──

    test('updateFile correctly increments counts for a new tag', function () {
        this.timeout(10000);

        const fakeUri = vscode.Uri.file('/tmp/test-update-increment.html');
        const fakeTag = 'test.update-increment-tag';

        // Ensure it starts at 0
        assert.strictEqual(index.getUsage(fakeTag).total, 0, 'Tag should not exist before update');

        // Add a file with the tag
        index.updateFile(fakeUri, `<c-${fakeTag}>hello</c-${fakeTag}>`);
        const usage = index.getUsage(fakeTag);
        assert.strictEqual(usage.total, 1, 'Should have total 1 after adding one occurrence');
        assert.strictEqual(usage.fileCount, 1, 'Should have fileCount 1');

        // Update with two occurrences
        index.updateFile(fakeUri, `<c-${fakeTag}>one</c-${fakeTag}><c-${fakeTag}>two</c-${fakeTag}>`);
        const usage2 = index.getUsage(fakeTag);
        assert.strictEqual(usage2.total, 2, 'Should have total 2 after update with two occurrences');
        assert.strictEqual(usage2.fileCount, 1, 'Should still have fileCount 1 (same file)');

        // Clean up
        index.removeFile(fakeUri);
    });

    test('updateFile replaces previous counts for the same file', function () {
        this.timeout(10000);

        const fakeUri = vscode.Uri.file('/tmp/test-update-replace.html');
        const fakeTag = 'test.update-replace-tag';

        // Add 3 occurrences
        index.updateFile(fakeUri, `<c-${fakeTag}/><c-${fakeTag}/><c-${fakeTag}/>`);
        assert.strictEqual(index.getUsage(fakeTag).total, 3);

        // Replace with 1 occurrence
        index.updateFile(fakeUri, `<c-${fakeTag}/>`);
        assert.strictEqual(index.getUsage(fakeTag).total, 1, 'Should replace, not accumulate');

        // Clean up
        index.removeFile(fakeUri);
    });

    test('updateFile across multiple files accumulates correctly', function () {
        this.timeout(10000);

        const uri1 = vscode.Uri.file('/tmp/test-multi-1.html');
        const uri2 = vscode.Uri.file('/tmp/test-multi-2.html');
        const fakeTag = 'test.multi-file-tag';

        index.updateFile(uri1, `<c-${fakeTag}/>`);
        index.updateFile(uri2, `<c-${fakeTag}/><c-${fakeTag}/>`);

        const usage = index.getUsage(fakeTag);
        assert.strictEqual(usage.total, 3, 'Total should be 3 across both files');
        assert.strictEqual(usage.fileCount, 2, 'fileCount should be 2');

        // Clean up
        index.removeFile(uri1);
        index.removeFile(uri2);
    });

    // ── removeFile ──

    test('removeFile correctly decrements counts', function () {
        this.timeout(10000);

        const uri1 = vscode.Uri.file('/tmp/test-remove-1.html');
        const uri2 = vscode.Uri.file('/tmp/test-remove-2.html');
        const fakeTag = 'test.remove-tag';

        index.updateFile(uri1, `<c-${fakeTag}/>`);
        index.updateFile(uri2, `<c-${fakeTag}/><c-${fakeTag}/>`);
        assert.strictEqual(index.getUsage(fakeTag).total, 3);

        // Remove one file
        index.removeFile(uri1);
        const usage = index.getUsage(fakeTag);
        assert.strictEqual(usage.total, 2, 'Total should be 2 after removing file with 1 occurrence');
        assert.strictEqual(usage.fileCount, 1, 'fileCount should be 1 after removing one file');

        // Remove the other file — tag should disappear entirely
        index.removeFile(uri2);
        const usage2 = index.getUsage(fakeTag);
        assert.strictEqual(usage2.total, 0, 'Total should be 0 after removing all files');
        assert.strictEqual(usage2.fileCount, 0, 'fileCount should be 0');
    });

    test('removeFile is a no-op for unknown URIs', function () {
        const unknownUri = vscode.Uri.file('/tmp/never-indexed.html');
        // Should not throw
        index.removeFile(unknownUri);
    });

    // ── getUsageDetail ──

    test('getUsageDetail returns per-file breakdown', function () {
        this.timeout(10000);

        const uri1 = vscode.Uri.file('/tmp/test-detail-1.html');
        const uri2 = vscode.Uri.file('/tmp/test-detail-2.html');
        const fakeTag = 'test.detail-tag';

        index.updateFile(uri1, `<c-${fakeTag}/>`);
        index.updateFile(uri2, `<c-${fakeTag}/><c-${fakeTag}/><c-${fakeTag}/>`);

        const detail = index.getUsageDetail(fakeTag);
        assert.strictEqual(detail.total, 4);
        assert.strictEqual(detail.files.length, 2, 'Should have 2 file entries');

        const file2 = detail.files.find(f => f.path.includes('test-detail-2'));
        assert.ok(file2, 'Should find detail-2 file');
        assert.strictEqual(file2!.count, 3, 'detail-2 should have 3 occurrences');

        // Clean up
        index.removeFile(uri1);
        index.removeFile(uri2);
    });

    test('getUsageDetail returns empty files for nonexistent tag', function () {
        const detail = index.getUsageDetail('atoms.nonexistent-never-used');
        assert.strictEqual(detail.total, 0);
        assert.strictEqual(detail.files.length, 0);
    });

    // ── Edge cases ──

    test('updateFile with no c-tags removes previous counts', function () {
        this.timeout(10000);

        const fakeUri = vscode.Uri.file('/tmp/test-no-tags.html');
        const fakeTag = 'test.disappearing-tag';

        index.updateFile(fakeUri, `<c-${fakeTag}/>`);
        assert.strictEqual(index.getUsage(fakeTag).total, 1);

        // Update with content that has no c-tags
        index.updateFile(fakeUri, '<div>No cotton tags here</div>');
        assert.strictEqual(index.getUsage(fakeTag).total, 0, 'Should be 0 after removing all tags from file');

        // Clean up
        index.removeFile(fakeUri);
    });

    test('updateFile handles multiple different tags in one file', function () {
        this.timeout(10000);

        const fakeUri = vscode.Uri.file('/tmp/test-multi-tags.html');
        const tagA = 'test.multi-tag-a';
        const tagB = 'test.multi-tag-b';

        index.updateFile(fakeUri, `<c-${tagA}/><c-${tagB}/><c-${tagB}/>`);
        assert.strictEqual(index.getUsage(tagA).total, 1);
        assert.strictEqual(index.getUsage(tagB).total, 2);

        // Clean up
        index.removeFile(fakeUri);
        assert.strictEqual(index.getUsage(tagA).total, 0);
        assert.strictEqual(index.getUsage(tagB).total, 0);
    });

    // ── c-component is/:is dynamic dispatch ──

    test('c-component is="literal" counts as direct use of the target tag', function () {
        const uri = vscode.Uri.file('/tmp/test-is-literal.html');
        const target = 'test.dispatch-literal-target';

        assert.strictEqual(index.getUsage(target).total, 0);

        index.updateFile(uri, `<c-component is="${target}" />`);
        assert.strictEqual(index.getUsage(target).total, 1);
        assert.strictEqual(index.getUsage(target).fileCount, 1);

        index.removeFile(uri);
        assert.strictEqual(index.getUsage(target).total, 0);
    });

    test('c-component is="prefix.{{ var }}" covers every tag under that prefix', function () {
        const uri = vscode.Uri.file('/tmp/test-is-prefix.html');
        // Use a unique made-up prefix so we don't collide with real workspace components.
        const prefix = 'dispatch-fake-prefix.';
        const target1 = prefix + 'spinner';
        const target2 = prefix + 'check';

        assert.strictEqual(index.getUsage(target1).total, 0);
        assert.strictEqual(index.getUsage(target2).total, 0);

        index.updateFile(uri, `<c-component is="${prefix}{{ name }}" />`);
        assert.strictEqual(index.getUsage(target1).total, 1, 'target1 reached via prefix match');
        assert.strictEqual(index.getUsage(target2).total, 1, 'target2 reached via prefix match');

        index.removeFile(uri);
        assert.strictEqual(index.getUsage(target1).total, 0);
        assert.strictEqual(index.getUsage(target2).total, 0);
    });

    test('c-component :is="var" records no usage (unresolvable expression)', function () {
        const uri = vscode.Uri.file('/tmp/test-is-dynamic.html');
        const probe = 'dispatch-fake-prefix.probe';

        index.updateFile(uri, `<c-component :is="some_var" />`);
        // No prefix, no literal — nothing should be recorded against any tag.
        assert.strictEqual(index.getUsage(probe).total, 0);

        index.removeFile(uri);
    });

    test('prefix usage merges with direct usage in getUsage', function () {
        const uriPrefix = vscode.Uri.file('/tmp/test-is-merge-prefix.html');
        const uriDirect = vscode.Uri.file('/tmp/test-is-merge-direct.html');
        const prefix = 'merge-fake-prefix.';
        const target = prefix + 'thing';

        index.updateFile(uriPrefix, `<c-component is="${prefix}{{ name }}" />`);
        index.updateFile(uriDirect, `<c-${target}></c-${target}>`);

        const usage = index.getUsage(target);
        assert.strictEqual(usage.total, 2, 'direct (1) + prefix (1)');
        assert.strictEqual(usage.fileCount, 2);

        index.removeFile(uriPrefix);
        index.removeFile(uriDirect);
    });

    test('getUsageDetail merges direct + prefix file lists', function () {
        const uriPrefix = vscode.Uri.file('/tmp/test-is-detail-prefix.html');
        const uriDirect = vscode.Uri.file('/tmp/test-is-detail-direct.html');
        const prefix = 'detail-fake-prefix.';
        const target = prefix + 'thing';

        index.updateFile(uriPrefix, `<c-component is="${prefix}{{ name }}" />`);
        index.updateFile(uriDirect, `<c-${target}></c-${target}><c-${target}></c-${target}>`);

        const detail = index.getUsageDetail(target);
        assert.strictEqual(detail.total, 3);
        assert.strictEqual(detail.files.length, 2);

        index.removeFile(uriPrefix);
        index.removeFile(uriDirect);
    });

    // ── End-to-end against the real test workspace ──
    //
    // test-django-cotton/templates/cotton/atoms/icon.html and several
    // molecule templates render icons via <c-component is="icons.{{ name }}" />.
    // If the index handles dispatch correctly, every existing icon under
    // templates/cotton/icons/ should show up as referenced.

    test('E2E: icons under icons/ are referenced via <c-component is="icons.{{ name }}">', function () {
        const usage = index.getUsage('icons.home');
        assert.ok(
            usage.total > 0,
            `icons.home should be reachable via prefix dispatch in the workspace, got total=${usage.total}`,
        );
        assert.ok(usage.fileCount > 0, 'fileCount must reflect the dispatching files');
    });

    test('E2E: icons.does-not-exist still appears as referenced (prefix is namespace-wide)', function () {
        // The prefix dispatch is by definition open-ended — even a non-existing
        // icon name reachable via 'icons.{{ name }}' is considered referenced.
        // That's correct behavior: we cannot say at edit time which strings
        // 'name' might take. Without this, every new icon would falsely appear
        // unused until used directly somewhere.
        const usage = index.getUsage('icons.totally-fake-never-existed');
        assert.ok(
            usage.total > 0,
            'Any tag under the icons. prefix should be marked as referenced via dispatch',
        );
    });
});
