// Платформа Lobsters на lobsters.pro (2026-10-25).
//
// Тот же Vercel-проект `redevelopment` (режим PUBLIC_SITE=platform), но на
// хосте lobsters.pro (+www):
//   /            — заглушка «Платформа Lobsters / Простите, пока не продаёмся»;
//   /admin*, /platform* — те же SPA, но с брендом Lobsters (свои HTML-шеллы,
//                  см. scripts/generate-lobsters-shells.mjs);
//   /api, /_vercel, статика и публичные токен-страницы (/tz, /estimate, /plan,
//                  /summary) — как есть, ими пользуется админка;
//   публичные страницы Redevelopment (каталоги, лендинги, /nl, /zakupki…) —
//                  301 на redevelopment.pro тот же путь (оттуда при необходимости
//                  дальше на officelist/malllist): не плодим дубли, не теряем людей;
//   всё остальное — 404 в бренде Lobsters.
// Весь хост noindex: X-Robots-Tag + robots.txt «Disallow: /», без Sitemap.
//
// Файл импортирует edge middleware — без React и без браузерных API.
// Хосты «Матрёшки» (src/lib/matreshkaHosts.js) здесь НЕ участвуют.
import lobstersConfig from '../data/lobsters.json';

export const LOBSTERS_HOST = 'lobsters.pro';
export const LOBSTERS_ORIGIN = 'https://lobsters.pro';
export const LOBSTERS_HOSTS: readonly string[] = ['lobsters.pro', 'www.lobsters.pro'];

/** Превью-симуляция хоста: ?brand=lobsters ставит cookie, ?brand=off снимает. Только VERCEL_ENV=preview/локально. */
export const LOBSTERS_PREVIEW_PARAM = 'brand';
export const LOBSTERS_PREVIEW_VALUE = 'lobsters';
export const LOBSTERS_PREVIEW_COOKIE = 'lobsters_preview';

export const LOBSTERS_STUB_PATH = '/lobsters-home.html';
export const LOBSTERS_ADMIN_SHELL = '/lobsters-admin.html';
export const LOBSTERS_PLATFORM_SHELL = '/lobsters-platform.html';

export const LOBSTERS_ROBOTS = 'User-agent: *\nDisallow: /\n';

/**
 * Рубильник 301 redevelopment.pro/admin* и /platform* → lobsters.pro (тот же путь).
 * В src/data/lobsters.json по умолчанию false — включать отдельным «да».
 */
export const REDEVELOPMENT_TO_LOBSTERS_REDIRECT_ENABLED =
  (lobstersConfig as { redirectRedevelopmentAdminToLobsters?: boolean }).redirectRedevelopmentAdminToLobsters === true;

function bareHost(host: string | null | undefined): string {
  return String(host || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

export function isLobstersHost(host: string | null | undefined): boolean {
  return LOBSTERS_HOSTS.includes(bareHost(host));
}

function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/');
}

const STATIC_EXT = /\.(?:html|js|mjs|css|map|json|xml|txt|ico|svg|png|jpg|jpeg|gif|webp|avif|ttf|woff|woff2|otf|pdf|webmanifest)$/i;

/** Служебное и то, на что ссылается сама админка: отдаём как есть. */
const PASS_PREFIXES = ['/api', '/_vercel', '/.well-known', '/assets', '/brand', '/tz', '/estimate', '/plan', '/summary'];

/** Публичные разделы redevelopment.pro: на lobsters.pro → 301 туда же. */
const REDEVELOPMENT_PUBLIC_EXACT = new Set([
  '/one',
  '/redstorage',
  '/rayon-minsk-mir',
  '/business-upload',
  '/privacy',
  '/offer',
  '/requisites',
  '/zakupki',
]);
const REDEVELOPMENT_PUBLIC_PREFIXES = ['/minsk', '/bc', '/favorites', '/pitch', '/nl', '/license'];

export type LobstersAction =
  | { type: 'www'; location: string }
  | { type: 'robots' }
  | { type: 'stub' }
  | { type: 'shell'; path: string }
  | { type: 'pass' }
  | { type: 'redirect'; location: string }
  | { type: 'notFound' };

/** Что делать с запросом на хосте lobsters.pro (search — с ведущим «?» или пустой). */
export function lobstersRoute(pathname: string, search = '', host = LOBSTERS_HOST): LobstersAction {
  const path = normalize(pathname || '/');
  if (bareHost(host).startsWith('www.')) {
    return { type: 'www', location: `${LOBSTERS_ORIGIN}${pathname || '/'}${search}` };
  }
  if (path === '/robots.txt') return { type: 'robots' };
  if (path === '/' || path === '') return { type: 'stub' };
  if (under(path, '/admin')) return { type: 'shell', path: LOBSTERS_ADMIN_SHELL };
  if (under(path, '/platform')) return { type: 'shell', path: LOBSTERS_PLATFORM_SHELL };
  if (path === '/sitemap.xml' || path === '/sitemap-index.xml' || path === '/sitemap-old-urls.xml') {
    return { type: 'notFound' };
  }
  if (PASS_PREFIXES.some((p) => under(path, p))) return { type: 'pass' };
  if (REDEVELOPMENT_PUBLIC_EXACT.has(path) || REDEVELOPMENT_PUBLIC_PREFIXES.some((p) => under(path, p))) {
    return { type: 'redirect', location: `https://redevelopment.pro${pathname}${search}` };
  }
  if (STATIC_EXT.test(path)) return { type: 'pass' };
  return { type: 'notFound' };
}

/**
 * 301 redevelopment.pro/admin*, /platform* → lobsters.pro (тот же путь и query).
 * null — не редиректим (рубильник выключен, другой хост или другой путь).
 */
export function redevelopmentToLobstersRedirect(
  host: string | null | undefined,
  pathname: string,
  search = '',
  enabled = REDEVELOPMENT_TO_LOBSTERS_REDIRECT_ENABLED,
): string | null {
  if (!enabled) return null;
  const bare = bareHost(host);
  if (bare !== 'redevelopment.pro' && bare !== 'www.redevelopment.pro') return null;
  const path = normalize(pathname || '/');
  if (!under(path, '/admin') && !under(path, '/platform')) return null;
  return `${LOBSTERS_ORIGIN}${pathname}${search}`;
}

/** Превью: включить/выключить симуляцию хоста lobsters.pro по query/cookie. */
export function lobstersPreviewState(
  searchParams: URLSearchParams,
  cookieHeader: string,
): { active: boolean; setCookie: string | null } {
  const v = searchParams.get(LOBSTERS_PREVIEW_PARAM);
  if (v === LOBSTERS_PREVIEW_VALUE) {
    return { active: true, setCookie: `${LOBSTERS_PREVIEW_COOKIE}=1; Path=/; Max-Age=86400; SameSite=Lax; Secure` };
  }
  if (v === 'off' || v === 'redevelopment') {
    return { active: false, setCookie: `${LOBSTERS_PREVIEW_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure` };
  }
  const active = new RegExp(`(?:^|;\\s*)${LOBSTERS_PREVIEW_COOKIE}=1(?:;|$)`).test(cookieHeader || '');
  return { active, setCookie: null };
}
