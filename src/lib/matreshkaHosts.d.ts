export declare const MATRESHKA_CLIENT_SLUG: 'matreshka';
export declare const MATRESHKA_HOSTS: readonly string[];
export declare const MATRESHKA_PREVIEW_FLAG: string;
export declare const MATRESHKA_TENANT_PARAM: string;
export declare function normalizeHost(host: string | null | undefined): string;
export declare function matreshkaSlugForHost(host: string | null | undefined): 'matreshka' | null;
export declare function isPreviewVercelHost(host: string | null | undefined, vercelEnv: string | undefined): boolean;
