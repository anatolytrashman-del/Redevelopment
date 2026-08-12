import { createClient } from '@supabase/supabase-js';

// Публичные значения: Project URL + publishable (anon) key. Доступ к данным
// регулируется RLS-политиками в Supabase, а не секретностью этих значений —
// именно поэтому их можно безопасно встраивать в клиентский бандл.
// Секретный (service_role) ключ здесь и вообще на фронтенде использовать нельзя.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
