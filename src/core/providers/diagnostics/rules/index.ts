/**
 * Public surface of the parity-rules pack. Each rule mirrors a gallery
 * linter check and lives in its own file under `rules/`. This index
 * re-exports them so callers import a single module.
 */

export { checkRequiredWithDefault } from './required-with-default';
export { checkTypeDefaultMismatch } from './type-default-mismatch';
export { checkEnumDefaultOutOfRange } from './enum-default-out-of-range';
export { checkDynamicPrefixMismatch } from './dynamic-prefix-mismatch';
export { checkMissingCVars } from './missing-cvars';
export {
    checkMissingDescription,
    getMissingDescriptionSeverity,
} from './missing-description';
