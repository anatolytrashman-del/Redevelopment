// Единый источник хостов клиентской админки «Матрешка» и хостов входа платформы.
// Используется: middleware.ts (edge), src/lib/tenant.ts (браузер), api/_matreshkaTenant.js (сервер).
//
// ИСКЛЮЧЕНИЕ из переименования: доменные строки клиента (punycode «основа» и латинский
// алиас) — внешние DNS-имена, их нельзя переименовать в коде. Они живут ТОЛЬКО здесь.
// Обычный JS (не TS), чтобы его могли импортировать serverless-функции api/*.js;
// типы — в соседнем matreshkaHosts.d.ts.

export const MATRESHKA_CLIENT_SLUG = 'matreshka';

/** Хосты клиента «Матрешка»: punycode, кириллица и латинский алиас. */
export const MATRESHKA_HOSTS = Object.freeze([
  'xn--80ad6adbq.redevelopment.pro',
  'основа.redevelopment.pro',
  'osnova.redevelopment.pro',
]);

/** Хосты платформы Redevelopment, где на «/» показывается вход в админку «Матрешка». */
export const PLATFORM_LOGIN_HOSTS = Object.freeze(['redevelopment.pro', 'www.redevelopment.pro']);

/** Флаг превью-override клиентского режима (sessionStorage + cookie). */
export const MATRESHKA_PREVIEW_FLAG = 'matreshka_preview';
/** Значение ?tenant=… для превью-override. */
export const MATRESHKA_TENANT_PARAM = 'matreshka';
/** Заголовок, которым экран входа на «/» платформы просит API работать в контексте клиента. */
export const MATRESHKA_ROOT_LOGIN_HEADER = 'x-matreshka-root-login';
/** Превью-симуляция хоста входа платформы: ?simulate_host=redevelopment.pro (только preview, *.vercel.app). */
export const SIMULATE_HOST_PARAM = 'simulate_host';

export function normalizeHost(host) {
  return String(host || '').trim().toLowerCase().split(',')[0].trim().replace(/:\d+$/, '').replace(/\.$/, '');
}

/** Слаг клиента по хосту (www. допускается) или null. */
export function matreshkaSlugForHost(host) {
  const h = normalizeHost(host).replace(/^www\./, '');
  return MATRESHKA_HOSTS.includes(h) ? MATRESHKA_CLIENT_SLUG : null;
}

/** redevelopment.pro / www.redevelopment.pro. */
export function isPlatformLoginHost(host) {
  return PLATFORM_LOGIN_HOSTS.includes(normalizeHost(host));
}

/** Превью-деплой на *.vercel.app (только там работают override/симуляция). */
export function isPreviewVercelHost(host, vercelEnv) {
  return vercelEnv === 'preview' && normalizeHost(host).endsWith('.vercel.app');
}

/** Корневой путь «/» (вход в админку «Матрешка» на хосте платформы). */
export function isRootPath(pathname) {
  return pathname === '/' || pathname === '';
}
