import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_OSNOVA_SUPABASE_URL || '').trim();
const anonKey = (import.meta.env.VITE_OSNOVA_SUPABASE_ANON_KEY || '').trim();
export const osnovaConfigMissing: string[] = [];
if (!url) osnovaConfigMissing.push('VITE_OSNOVA_SUPABASE_URL');
if (!anonKey) osnovaConfigMissing.push('VITE_OSNOVA_SUPABASE_ANON_KEY');
if (osnovaConfigMissing.length > 0) {
  console.error('osnova config missing', osnovaConfigMissing);
}

const safeUrl = url || 'https://osnova-config-missing.invalid';
const safeKey = anonKey || 'missing';

export const osnovaSupabase = createClient(safeUrl, safeKey, {
  auth: {
    storageKey: 'osnova-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
