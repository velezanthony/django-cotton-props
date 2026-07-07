# Django Cotton Props

> **Full IntelliSense, validation, and tooling for [Django Cotton](https://django-cotton.com/) components in VS Code** — autocomplete, hover docs, 21 diagnostic rules, quick fixes, and a component explorer. Stop guessing prop names and catch template mistakes before they hit the runtime.

## See it in action

**Autocomplete every component, navigate, and accept — without leaving the keyboard**

![Autocomplete demo](https://raw.githubusercontent.com/velezanthony/django-cotton-props/main/images/autocomplete.gif)

**Hover any tag for its full prop documentation**

![Hover docs](https://raw.githubusercontent.com/velezanthony/django-cotton-props/main/images/hover.png)

**Catch mistakes as you type — 21 diagnostic rules**

![Diagnostics](https://raw.githubusercontent.com/velezanthony/django-cotton-props/main/images/diagnostics.png)

**Select any component to inspect its props, slots, and highlighted source — in the sidebar**

![Component detail panel](https://raw.githubusercontent.com/velezanthony/django-cotton-props/main/images/sidebar.png)

## Getting started

1. **Install** — search **Django Cotton Props** in the Extensions view, or run `ext install velezanthony.django-cotton-props`.
2. **Requirements** — a [Django Cotton](https://django-cotton.com/) project with component templates, and VS Code **1.97+**. The default `templates/cotton/` layout needs zero configuration.
3. **Go** — open any `.html` or `django-html` template, type `<c-`, and autocomplete, hover docs, and diagnostics light up instantly.

## Features

Everything works in `.html` and `django-html` files, live as you type.

| | |
|---|---|
| ⚡ **Autocomplete** | tags, props, and values — grouped by category, with type / default / required / deprecated badges |
| 💡 **Hover docs** | description, prop table, slots, and trigger HTML on any tag or prop |
| 🧭 **Navigation** | Go to Definition (`F12`), Find All References, Outline symbols, Rename Prop (`F2`) |
| 🔀 **Dynamic dispatch** | understands `<c-component is="...">` in all three forms |
| 🚦 **Diagnostics** | 21 edit-time rules across component and usage files |
| 🛠️ **Quick fixes** | one-click document / sync / insert actions for every diagnostic |
| 🔁 **Auto-rename tag** | the closing tag follows the opening tag as you edit, through nesting |
| 🗂️ **Sidebar explorer** | component tree, detail panel, and drag-and-drop usage blocks |
| 🎁 **Refactors** | Wrap with Component, Extract to Component, convert direct ↔ dispatch |
| 🎨 **Editor aids** | semantic highlighting, inlay hints, code lens, folding, signature help, status-bar count |
| 📁 **Safe renames** | renaming a component file updates every `<c-tag>` reference project-wide |

<details>
<summary><strong>🚦 All 21 diagnostic rules</strong> — what gets flagged at edit time</summary>

**In component files:**
- Duplicate `@prop` definitions
- `@prop` missing from `<c-vars>` (shows default value if defined)
- Undocumented props in `<c-vars>`
- Unused props (defined but never referenced in template body)
- Default mismatch — `@prop` and `<c-vars>` have different default values
- `@prop` defines default but `<c-vars>` attr has no value (bare attr)
- `<c-vars>` has default value but `@prop` doesn't document one
- `| required` co-exists with `| default:` (parser silently drops `required`)
- Type-default mismatch — `:boolean` default outside `True/False/1/0`, or `:number` default that won't parse
- Enum default out of range — `:select` default (or `<c-vars>` value) not in the option list
- Dynamic-prefix mismatch — `:foo` in `@prop` vs `foo` in `<c-vars>` (or vice versa)
- Missing `<c-vars>` — `@prop` declared but no `<c-vars>` tag (Cotton passes nothing to the template)
- Missing prop description — `@prop` without `| description:` filter (hint-level)

**In usage files:**
- Component not found
- Unknown prop (`@strict` mode)
- Duplicate prop on same tag
- Deprecated prop usage (strikethrough hint)
- Invalid type value (select, boolean, number)
- Missing required prop

> [!NOTE]
> **Unused components** are flagged in the sidebar (badge `U` on the tree item), not as a file diagnostic — "this component isn't referenced anywhere" is metadata about its place in the system, not a code error. Add `{# @ignore-unused #}` inside the component file to suppress it for library or dynamic-tag components.

> [!TIP]
> **Type validation is smart-skipped** for dynamic props (`:collapsed="variable"`) and template expressions (`{{ var }}`, `{% tag %}`) — those are Django values, not literals, so there are no false positives.
>
> ```html
> <c-atoms.badge variant="oops" />            <!-- Error: invalid select value -->
> <c-atoms.badge :variant="user_variant" />   <!-- skipped: Django variable -->
> ```

</details>

<details>
<summary><strong>🛠️ Every quick fix</strong> — one click on the lightbulb</summary>

- **Document prop** / **Document all props** — generate `@prop` annotations with guessed types
- **Add required prop** / **Add all required props** — insert missing required props with defaults
- **Add to `<c-vars>`** / **Add all missing** — insert missing props in the right format (`:dynamic`, `boolean=False`, `text="value"`)
- **Sync `<c-vars>` default** — update a bare or mismatched value to match the `@prop` default
- **Remove `| required` / Remove `| default:`** — resolve a required-with-default conflict
- **Replace with `<option>`** — one action per allowed `:select` option when a value is out of range
- **Add / Remove `:` prefix** — toggle the dynamic prefix on a `<c-vars>` attr to match its `@prop`
- **Add `<c-vars />` tag** — insert the missing declaration when `@prop` has no `<c-vars>` sibling
- **Add `| description:""` filter** — fill in a missing description

</details>

<details>
<summary><strong>🔀 Dynamic tag dispatch</strong> — the three forms of <code>&lt;c-component is="..."&gt;</code></summary>

Cotton's built-in dispatcher renders a component whose name is decided at runtime. The extension understands all three shapes:

| Syntax | Treatment |
|--------|-----------|
| `<c-component is="icons.spinner" />` | Direct reference to `c-icons.spinner` — full Go-to-Definition, hover, completion, references. Emits `component-not-found` if it doesn't resolve. |
| `<c-component is="icons.{{ name }}" />` | The static head is a **prefix match**: every component under `c-icons.*` counts as referenced (no false `unused` badge). |
| `<c-component :is="my_var" />` | Pure Django expression — unresolvable. Use `{# @ignore-unused #}` on the target if needed. |

Multi-line declarations work the same way. Renaming a component file rewrites every `is="literal-target"` pointing at it, and a refactor action converts between the direct and dispatch forms.

</details>

<details>
<summary><strong>🗂️ Sidebar explorer</strong> — tree, badges, detail panel, drag & drop</summary>

The activity-bar icon opens the **Cotton Components** panel:

- **Components tree** — collapsible categories with aggregated diagnostic counts: `atoms 59 · 4E 2W 8H · 12 unused`
- **Per-component badges** — `2E 1W` (errors / warnings) when diagnostics are present, plus a `U` badge for unused components
- **Detail panel** — click a component for its props table, slots, and syntax-highlighted source
- **Drag & drop** — drag a component into the editor to insert a full usage block with every prop as a tabstop and defaults pre-filled; `Tab` steps through them
- **Copy tag** and in-tree **search** (`Ctrl+F`)

</details>

<details>
<summary><strong>🎨 Semantic highlighting</strong> — <code>@prop</code> annotation colors (theme-aware)</summary>

| Token | Example | Color |
|-------|---------|-------|
| Delimiters | `{#` `#}` `\|` | comment (green/gray) |
| Keywords | `@prop` | keyword (purple) |
| Prop name | `variant` | variable (blue) |
| Filter names | `default` `description` | variable (blue) |
| Values | `"primary"` `13` `False` | string (orange) |
| Component tags | `c-atoms.button` | keyword (purple) |

Colors adapt to your active VS Code theme.

</details>

## Prop annotation syntax

The `@prop` annotation documents a prop; `<c-vars>` declares it for Cotton. They must stay in sync — the diagnostics exist to catch the moment they drift.

```html
{# @description One-line summary shown on hover. #}
{# @prop variant:select['primary', 'secondary', 'danger'] | default:"primary" | description:"Style variant" #}
{# @prop loading:boolean | default:False | description:"Show loading spinner" #}
{# @prop :count:number | default:0 | description:"Badge count (dynamic)" #}
{# @prop lat:text | description:"Latitude" | required #}
{# @prop old-api:text | deprecated:"Use new-api" | hidden #}
{# @slot:header — Header slot for custom content. #}
{# @trigger <button>Open</button> — Trigger element #}
{# @strict #}
```

<details>
<summary><strong>Filters, types & dynamic props</strong> — full reference</summary>

**Filters**

| Filter | Example | Description |
|--------|---------|-------------|
| `default` | `\| default:"primary"` | Default value (strings quoted, numbers/booleans unquoted) |
| `description` | `\| description:"Style"` | Prop description |
| `required` | `\| required` | Prop is mandatory (no default allowed) |
| `deprecated` | `\| deprecated:"Use X"` | Marks prop as deprecated |
| `hidden` | `\| hidden` | Hides from autocomplete and gallery |
| `example` | `\| example:"bg-brand"` | Example value shown in hover docs |

**Types**

| Type | Gallery control | Example |
|------|-----------------|---------|
| `text` | Text input | `name:text \| default:"Hello"` |
| `number` | Number input | `:count:number \| default:0` |
| `boolean` | Toggle | `loading:boolean \| default:False` |
| `select` | Dropdown | `size:select['sm', 'md', 'lg'] \| default:"md"` |

**Dynamic props (`:` prefix)** — prefix with `:` when the value is a Django expression (list, dict, variable). The `:` must match between `@prop` and `<c-vars>`:

```html
{# @prop :count:number | default:5 | description:"Badge count" #}
<c-vars :count="5" />
```

</details>

<details>
<summary><strong>Real-world component examples</strong> — badge, alert, input group</summary>

**Atom — badge with dynamic count:**

```html
{# @prop :count:number | default:0 | description:"Number to display" #}
{# @prop :max:number | default:99 | description:"Maximum before showing max+" #}
<c-vars :count="0" :max="99" />

{% if count and count > 0 %}
  <span class="inline-flex items-center justify-center px-1 text-xs font-bold text-white bg-danger-500 rounded-full">
    {% if count > max %}{{ max }}+{% else %}{{ count }}{% endif %}
  </span>
{% endif %}
```

**Atom — alert with boolean and select:**

```html
{# @prop variant:select['info', 'success', 'warning', 'danger'] | default:"info" | description:"Alert style" #}
{# @prop dismissible:boolean | default:False | description:"Show close button" #}
<c-vars variant="info" dismissible=False />

<div class="p-4 rounded-lg bg-{{ variant }}-50 text-{{ variant }}-700" role="alert">
  {{ slot }}
  {% if dismissible is True %}
    <button type="button" class="float-right">&times;</button>
  {% endif %}
</div>
```

**Molecule — input group with attrs pass-through:**

```html
{# @prop label:text | description:"Field label" #}
{# @prop :errors:text | description:"Validation errors" #}
{# @prop required:boolean | default:False | description:"Required indicator" #}
<c-vars label errors required=False />

<div class="mb-4">
  {% if label %}
    <c-atoms.label :required="required">{{ label }}</c-atoms.label>
  {% endif %}
  <c-atoms.input :attrs="attrs" />
  <c-atoms.field-error :errors="errors" />
</div>
```

Usage — `name`, `placeholder`, `type` pass through via `attrs`:

```html
<c-molecules.input-group label="Email" name="email" type="email" placeholder="you@example.com" required />
```

</details>

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `djangoCottonProps.templatePaths` | `["templates/cotton"]` | Path suffixes scanned for component **definitions**, matched at any depth (root + every Django app). Applies live. |
| `djangoCottonProps.excludePaths` | `["node_modules", "dist", "build", "venv", "__pycache__", "coverage", ".*"]` | Folder segments skipped when scanning for component **usages**. Applies live. |
| `djangoCottonProps.inlayHints.showDefaults` | `true` | Show default values as inlay hints for unset props. |
| `djangoCottonProps.dynamicAttr.showExpressionHint` | `true` | Render faded `{{ }}` braces around dynamic `:prop="…"` values. |
| `djangoCottonProps.diagnostics.missingDescription.severity` | `"hint"` | Severity for the *missing prop description* diagnostic — `hint`, `warning`, or `off`. |

<details>
<summary><strong>📋 Copy-paste <code>settings.json</code></strong> — all values at their defaults</summary>

```jsonc
{
  // Where component definitions live — path suffixes, matched at any depth.
  "djangoCottonProps.templatePaths": ["templates/cotton"],

  // Folder segments skipped when scanning for component usages.
  "djangoCottonProps.excludePaths": ["node_modules", "dist", "build", "venv", "__pycache__", "coverage", ".*"],

  // Show default values as inlay hints for unset props.
  "djangoCottonProps.inlayHints.showDefaults": true,

  // Render faded {{ }} braces around dynamic :prop="…" values.
  "djangoCottonProps.dynamicAttr.showExpressionHint": true,

  // Severity for the "missing prop description" diagnostic: "hint" | "warning" | "off".
  "djangoCottonProps.diagnostics.missingDescription.severity": "hint"
}
```

</details>

## Troubleshooting

<details>
<summary><strong>Components not showing up?</strong></summary>

- **No completions, or the sidebar is empty?** The extension scans `templates/cotton/` by default. If your components live elsewhere, add the folder to `djangoCottonProps.templatePaths` — path suffixes matched at any depth, so one entry covers the project root and every Django app. Changes apply live, no reload.
- **A component is flagged `unused` but it isn't?** It's reached only through a dynamic `<c-component is="...">` the indexer can't resolve. Add `{# @ignore-unused #}` inside the component file to clear the badge.
- **A usage isn't validated?** Type checks are skipped on purpose for dynamic props (`:prop="var"`) and template expressions (`{{ }}`, `{% %}`) — those are Django values, not literals.

</details>

---

Built for [Django Cotton](https://django-cotton.com/) · MIT licensed · Requires VS Code 1.97+
