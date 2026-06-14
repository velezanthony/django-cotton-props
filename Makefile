# django-cotton-props — task entrypoint
#
# This Makefile is a FACADE: it delegates to the npm scripts in package.json
# instead of duplicating their logic. Only commands npm doesn't already cover
# (open coverage, package the .vsix, publish, clean) are defined here directly.
#
# Run `make` or `make help` to list every target, grouped by section.

COVERAGE_REPORT := coverage/index.html
OPEN := xdg-open
# Derived from package.json so it always matches what `vsce package` emits.
VSIX := $(shell node -p "require('./package.json').name+'-'+require('./package.json').version+'.vsix'" 2>/dev/null)

.DEFAULT_GOAL := help

##@ Arranque
watch: ## Recompile on save (esbuild + tsc in parallel)
	npm run watch

check: ## Type-check + lint (no build)
	npm run check-types
	npm run lint

lint: ## Run eslint over src
	npm run lint

##@ Tests
test: ## Run the full test suite (no coverage — faster)
	npm test

coverage: ## Run tests WITH coverage and open the HTML report
	npm run test:coverage
	$(OPEN) $(COVERAGE_REPORT)

ci: ## Full CI gate: type-check, lint, and tests (ordered, no parallelism)
	$(MAKE) check
	$(MAKE) test

##@ Release
build: ## Production build (minified, via esbuild)
	npm run package

vsix: build ## Package an installable .vsix in the project root
	npx @vscode/vsce package

install: vsix ## Build the .vsix and install it into your local VS Code
	code --install-extension $(VSIX)

publish: ## Publish to the VS Code Marketplace
	npx @vscode/vsce publish

clean: ## Remove build, test and coverage artifacts
	# Deliberately does NOT remove .vscode-test/ — it caches a full ~243MB
	# VS Code binary that the test runner reuses across runs. Wiping it would
	# force a re-download on the next `make test`. It's already gitignored.
	rm -rf out dist coverage *.vsix

clean-cache: ## Remove the cached VS Code test binary (~243MB; re-downloaded on next test)
	rm -rf .vscode-test

##@ Meta
help: ## Show this help, grouped by section
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next } \
		/^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' \
		$(MAKEFILE_LIST)

.PHONY: watch check lint test coverage ci build vsix install publish clean clean-cache help
