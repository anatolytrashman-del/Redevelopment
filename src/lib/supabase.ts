import { createClient } from '@supabase/supabase-js';

// Публичные значения: Project URL + publishable (anon) key. Доступ к данным
// регулируется RLS-политиками в Supabase, а не секретностью этих значений —
// именно поэтому их можно безопасно встраивать в клиентский бандл.
// Секретный (service_role) ключ здесь и вообще на фронтенде использовать нельзя.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';

const makeClient = () => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
type SupabaseClient = ReturnType<typeof makeClient>;

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  client ??= makeClient();
  return client;
}

// Клиент создаётся при первом обращении, а не при загрузке модуля
// (2026-09-23). Публичные страницы раздела БЦ читают данные из файлов
// сборки (src/lib/buildData.ts) и в базу не ходят вовсе, а createClient —
// это ещё и realtime-клиент, хранилище сессии и прочая инициализация:
// ~140 мс процессора на телефоне в отчёте PageSpeed страницы аналитики,
// впустую на каждой публичной странице. Снаружи ничего не меняется —
// `supabase.from(...)`, `supabase.storage`, `supabase.channel(...)` идут
// в настоящий клиент; методы привязаны к нему, чтобы `this` внутри был он.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = getClient();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
