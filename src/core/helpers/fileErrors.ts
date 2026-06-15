/**
 * True when an error means the file simply isn't there (Node `ENOENT` or VS Code
 * `FileNotFound`). In this extension that's an EXPECTED race — a component
 * deleted/renamed/moved mid-flight — so callers swallow it and log only real failures.
 */
export function isFileNotFound(err: unknown): boolean {
    const code = (err as { code?: unknown } | null | undefined)?.code;
    return code === 'ENOENT' || code === 'FileNotFound';
}
