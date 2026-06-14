export interface PropDefinition {
    name: string;
    cleanName: string;
    type: 'text' | 'number' | 'boolean' | 'select';
    options: string[];
    defaultValue: string;
    hasDefault: boolean;
    description: string;
    isDynamic: boolean;
    required: boolean;
    deprecated?: string;   // undefined = not deprecated, '' = no message, 'msg' = with message
    hidden: boolean;
    example: string;
}