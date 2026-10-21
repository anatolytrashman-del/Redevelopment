import { createClient } from '@supabase/supabase-js';

// Публичные значения: Project URL + publishable (anon) key. Доступ к данным
// регулируется RLS-политиками в Supabase, а не секретностью этих значений —
// именно поэтому их можно безопасно встраивать в клиентский бандл.
// Секретный (service_role) ключ здесь и вообще на фронтенде использовать нельзя.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';

// Запасной путь до Supabase через наш домен (2026-10-21): vercel.json
// проксирует /api/sb/* на проект. Если прямой запрос к *.supabase.co не
// дошёл (сетевая ошибка — домен режется у провайдера, «нет связи с базой»
// на экране входа), повторяем его через прокси и до конца вкладки ходим уже
// так. Пока прямой путь работает, ничего не меняется. Realtime (websocket)
// через прокси не ходит — Vercel не проксирует websocket — он остаётся прямым.
const PROXY_PATH = '/api/sb';
const PROXY_FLAG_KEY = 'redevelopment-supabase-via-proxy';
// Прямой запрос, который не отвечает вовсе (DPI «подвешивает», а не рвёт),
// для входа/сессии и чтений обрываем раньше общего таймаута и идём в прокси.
const DIRECT_TIMEOUT_MS = 8000;

function proxyBase(): string | null {
  if (typeof window === 'undefined') return null;
  const { protocol, hostname, origin } = window.location;
  // Локально (vite dev/preview, пререндер на localhost) прокси нет.
  if (protocol !== 'https:' || hostname === 'localhost' || hostname === '127.0.0.1') return null;
  return origin + PROXY_PATH;
}

function viaProxyFlag(): boolean {
  try {
    return sessionStorage.getItem(PROXY_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function setViaProxyFlag() {
  try {
    sessionStorage.setItem(PROXY_FLAG_KEY, '1');
  } catch {
    /* приватный режим — просто не запоминаем */
  }
}

const resilientFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const base = proxyBase();
  if (!base || !url.startsWith(SUPABASE_URL)) return fetch(input, init);
  const proxied = base + url.slice(SUPABASE_URL.length);
  if (viaProxyFlag()) return fetch(proxied, init);

  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  // Повторять можно только то, что безопасно отправить дважды: чтения и вход
  // (повторная выдача токена ничего не портит). Запись при сетевой ошибке не
  // дублируем — следующие запросы и так пойдут через прокси.
  const retryable = method === 'GET' || method === 'HEAD' || url.includes('/auth/v1/');
  const controller = retryable && !init?.signal ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), DIRECT_TIMEOUT_MS) : null;
  try {
    return await fetch(input, controller ? { ...init, signal: controller.signal } : init);
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    setViaProxyFlag();
    if (!retryable) throw err;
    return fetch(proxied, init);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const makeClient = () => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { global: { fetch: resilientFetch } });
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
