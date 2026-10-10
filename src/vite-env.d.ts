/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** platform | offices | malls — какой сайт отдаёт этот деплой */
  readonly VITE_PUBLIC_SITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// ISO-время сборки, подставляется через define в vite.config.ts.
declare const __BUILD_TIME__: string;
/** platform | offices | malls — vite.config.ts define из VITE_PUBLIC_SITE */
declare const __DEPLOYED_SITE_MODE__: string;
