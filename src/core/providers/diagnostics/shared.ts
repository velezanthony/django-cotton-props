export interface SeenDef {
    index: number;
    hasDefault: boolean;
    defaultValue: string;
    isDynamic: boolean;
}

export type SeenDefs = Map<string, SeenDef>;

export { nameVariations } from '../../naming';
