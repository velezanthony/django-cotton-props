export type QuickFixData =
    | { kind: 'undocumented'; suggestion: string; cVarsOrder: number }
    | { kind: 'missing-from-cvars'; attrText: string; insertOffset: number }
    | { kind: 'sync-default'; replaceStart: number; replaceEnd: number; newText: string }
    | { kind: 'missing-required'; propName: string; propType: string; propDefault: string; insertOffset: number }
    | {
          kind: 'required-with-default-conflict';
          /** Range of the `| required` filter, with the leading space if any. */
          requiredStart: number; requiredEnd: number;
          /** Range of the `| default:VALUE` filter, with the leading space if any. */
          defaultStart: number; defaultEnd: number;
      }
    | {
          kind: 'replace-with-option';
          replaceStart: number; replaceEnd: number;
          /** Allowed values for this select prop — one quick-fix per option. */
          options: string[];
          /** Whether to wrap the replacement in double-quotes (true for @prop default and quoted c-vars values). */
          quoted: boolean;
      }
    | {
          kind: 'toggle-dynamic-prefix';
          /** Offset of the attribute name (excluding any leading `:`). */
          nameStart: number;
          /** True if the c-vars side currently has `:` and we want to remove it. */
          hasPrefix: boolean;
      }
    | { kind: 'add-empty-cvars'; insertOffset: number }
    | { kind: 'add-prop-description'; insertOffset: number };
