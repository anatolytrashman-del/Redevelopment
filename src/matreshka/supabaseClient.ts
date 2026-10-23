import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_MATRESHKA_SUPABASE_URL || '').trim();
const anonKey = (import.meta.env.VITE_MATRESHKA_SUPABASE_ANON_KEY || '').trim();
export const matreshkaConfigMissing: string[] = [];
if (!url) matreshkaConfigMissing.push('VITE_MATRESHKA_SUPABASE_URL');
if (!anonKey) matreshkaConfigMissing.push('VITE_MATRESHKA_SUPABASE_ANON_KEY');
if (matreshkaConfigMissing.length > 0) {
  console.error('matreshka config missing', matreshkaConfigMissing);
}

const safeUrl = url || 'https://matreshka-config-missing.invalid';
const safeKey = anonKey || 'missing';

export const matreshkaSupabase = createClient(safeUrl, safeKey, {
  auth: {
    storageKey: 'matreshka-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
