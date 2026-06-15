# Change Log

All notable changes to the Django Cotton Props extension are documented here.

This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] — 2026-06-13

First public release — a complete IntelliSense, validation, and tooling suite for [Django Cotton](https://django-cotton.com/) components in VS Code.

### Autocomplete & hover

- **Tag, prop, and value completion** — components grouped by category with prop docs; props with type/default/required/deprecated badges; allowed values for `select` and `boolean` props.
- **Annotation snippets** — `@description`, `@prop` (text/number/boolean/select/required variants), `@slot`, `@slot:NAME`, `@trigger`, `@strict`.
- **Structured hover docs** — on a tag: description, prop table (type + default), slots, trigger HTML, and an `@strict` chip; on a prop: detail, description, and allowed values.

### Navigation & refactoring

- **Go to Definition**, **Find All References**, and **Outline** symbols for `@prop`/`@slot`/`@trigger`/`@strict`.
- **Rename prop** (F2) propagates across the `@prop` annotation, `<c-vars>`, the template body, and every usage file.
- **Auto-rename tag** — opening/closing pairs stay in sync as you type, bidirectionally and through nesting.
- **Dynamic tag dispatch** (`<c-component is="...">`) understood in all three forms — literal target (full resolution), prefix + interpolation (`is="icons.{{ name }}"`, prefix match), and pure expression (`:is="var"`, intentionally untracked). Multi-line tags work; file renames rewrite literal dispatch values; a refactor converts between direct and dispatch forms.

### Diagnostics (21 rules)

- **Component files** — duplicate `@prop`, `@prop` missing from `<c-vars>`, undocumented props, unused props, default mismatch, bare-attr default, `required` + `default` conflict, type-default mismatch, enum default out of range, dynamic-prefix mismatch, missing `<c-vars>`, missing description.
- **Usage files** — component not found, unknown prop (`@strict`), duplicate prop, deprecated prop, invalid type value, missing required prop, `<c-component>` without `is`.
- **Smart-skip** — type validation is never run on dynamic props (`:prop="var"`) or template expressions (`{{ }}` / `{% %}`).

### Quick fixes

- Document a prop (guessed type) or all missing props; add a required prop or all of them; add to `<c-vars>` (or all missing); sync a `<c-vars>` default; resolve a `required`/`default` conflict; replace an out-of-range value with a valid `<option>`; toggle the `:` dynamic prefix; insert a missing `<c-vars />`; add a missing `| description:""`.

### Sidebar & editor aids

- **Cotton Components explorer** — collapsible category tree with per-item diagnostic counts (`2E 1W`), unused (`U`) badges, and category-level aggregates.
- **Detail panel** — props table, slots, and syntax-highlighted component source (theme-aware).
- **Drag & drop** a component into the editor to paste a full usage block with every prop expanded as a tabstop and defaults pre-filled; plus copy-tag and in-tree search.
- **Signature help**, **inlay hints** (default values), **code lens** (usage counts), **folding** of annotation blocks, **semantic highlighting** of `@prop` annotations, and faded `{{ }}` hints on dynamic `:prop` values.
- **Commands** — Wrap with Component, Extract to Component, Find Extractable Patterns. Status bar shows the component count.

### Configuration

- `djangoCottonProps.templatePaths` — depth-agnostic, multi-app component discovery.
- `djangoCottonProps.excludePaths` — folders skipped entirely, dropped from both the component tree and the usage scan.
- `djangoCottonProps.inlayHints.showDefaults`, `djangoCottonProps.dynamicAttr.showExpressionHint`, `djangoCottonProps.diagnostics.missingDescription.severity`.
- All settings apply **live** — no window reload.

### Quality & security

- **585 automated tests** running in a real VS Code Extension Host.
- Path-traversal guard on Extract to Component; undoable file creation via `WorkspaceEdit`; a scripts-disabled detail webview with a strict Content-Security-Policy and full HTML escaping.
- Surgical sidebar refresh (no full rebuild per keystroke) and parallel-batched workspace scanning for fast activation on large projects.

### Requirements

- VS Code **1.97+**.
