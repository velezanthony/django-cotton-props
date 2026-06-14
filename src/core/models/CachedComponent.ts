import type { ParsedComponent } from './ParsedComponent';

/**
 * Scanner cache entry. Embeds the full ParsedComponent so a single file read
 * powers every IDE provider (props, slots, trigger, description, c-vars,
 * strict mode). The `strict` and `props` legacy aliases are kept so existing
 * consumers (`getCachedProps`, `isStrict`) don't change shape.
 */
export interface CachedComponent extends ParsedComponent {
    /** mtimeMs from fs.statSync — drives cache invalidation. */
    mtime: number;
    /** Legacy alias for `isStrict`, kept so `isStrict(path)` callers still work. */
    strict: boolean;
}