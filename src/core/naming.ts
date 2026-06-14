export function toSnake(name: string): string {
    return name.replace(/-/g, '_');
}

export function toKebab(name: string): string {
    return name.replace(/_/g, '-');
}

export function nameVariations(name: string): string[] {
    const snake = toSnake(name);
    const kebab = toKebab(name);
    return snake === kebab ? [snake] : [snake, kebab];
}
