import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	workspaceFolder: 'test-django-cotton',
	coverage: {
		// Surface files NO test imports too (they show as 0%) — that's the whole
		// point: see the gaps, not just the covered paths.
		includeAll: true,
		include: ['src/**'],
		exclude: ['src/test/**'],
		reporter: ['text-summary', 'text', 'html'],
	},
});
