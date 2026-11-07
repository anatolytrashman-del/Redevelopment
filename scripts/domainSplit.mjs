// Дубликат src/data/domain-split.json + логика из src/lib/sites.ts для
// Node-скриптов сборки (generate-sitemap, indexnow) — без TS-загрузчика.
// Правишь JSON или правила редиректа — правь и src/lib/sites.ts.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(resolve(HERE, '../src/data/domain-split.json'), 'utf8'));

export const PLATFORM_ORIGIN = CONFIG.platform.origin;
export const OFFICES_ORIGIN = CONFIG.offices.origin;
export const MALLS_ORIGIN = CONFIG.malls.origin;
export const PLATFORM_HOST = CONFIG.platform.host;
export const OFFICES_HOST = CONFIG.offices.host;
export const MALLS_HOST = CONFIG.malls.host;

export const REDIRECT_MALLS_ENABLED =
  CONFIG.enabled === true || CONFIG.redirects?.malls === true;
export const REDIRECT_OFFICES_ENABLED =
  CONFIG.enabled === true || CONFIG.redirects?.offices === true;

/** true — хотя бы один каталог уехал на свой домен. */
export const CATALOG_DOMAIN_SPLIT_ENABLED = REDIRECT_MALLS_ENABLED || REDIRECT_OFFICES_ENABLED;

/** Отдельный Vercel-проект: PUBLIC_SITE / VITE_PUBLIC_SITE = malls|offices|platform */
export function deployedSiteMode() {
  const raw = String(process.env.PUBLIC_SITE || process.env.VITE_PUBLIC_SITE || 'platform')
    .trim()
    .toLowerCase();
  if (raw === 'malls' || raw === 'malllist' || raw === 'tc') return 'malls';
  if (raw === 'offices' || raw === 'officelist' || raw === 'offiselist' || raw === 'bc') return 'offices';
  return 'platform';
}

export const DEPLOYED_SITE_MODE = deployedSiteMode();

/** Meta yandex-verification для каталожного деплоя (пусто — не трогаем). */
export function catalogYandexVerification() {
  if (DEPLOYED_SITE_MODE === 'malls') return CONFIG.verifications?.malls?.yandex || '';
  if (DEPLOYED_SITE_MODE === 'offices') return CONFIG.verifications?.offices?.yandex || '';
  return '';
}

/** Доп. коды Вебмастера текущего каталога. Платформа — пусто, чужой сайт не подмешивается. */
export function catalogYandexExtraCodes(mode = DEPLOYED_SITE_MODE) {
  const block =
    mode === 'malls' ? CONFIG.verifications?.malls : mode === 'offices' ? CONFIG.verifications?.offices : null;
  if (!block || !Array.isArray(block.yandexExtra)) return [];
  return block.yandexExtra.filter(Boolean).map(String);
}

/** Дописывает отсутствующие доп. meta, не переписывая уже стоящие теги. */
export function appendMissingYandexExtras(html, codes = catalogYandexExtraCodes()) {
  let out = html;
  for (const code of codes) {
    if (!code || out.includes(`content="${code}"`)) continue;
    const escaped = String(code).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    if (!out.includes('</head>')) break;
    out = out.replace('</head>', `<meta name="yandex-verification" content="${escaped}" />\n</head>`);
  }
  return out;
}

export function catalogOrigin(kind) {
  if (DEPLOYED_SITE_MODE === 'malls') return MALLS_ORIGIN;
  if (DEPLOYED_SITE_MODE === 'offices') return OFFICES_ORIGIN;
  if (kind === 'tc' && REDIRECT_MALLS_ENABLED) return MALLS_ORIGIN;
  if (kind === 'bc' && REDIRECT_OFFICES_ENABLED) return OFFICES_ORIGIN;
  return PLATFORM_ORIGIN;
}

/** Гид по району и посадочные — на officelist. */
export function isOfficesDistrictPath(path) {
  return path === '/minsk/minsk-mir' || path.startsWith('/minsk/minsk-mir/') || path === '/rayon-minsk-mir';
}

/** path вида /minsk/bc/... или /minsk/tc/... → абсолютный URL нужного сайта. */
export function absoluteUrlForPath(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === '/minsk/tc' || normalized.startsWith('/minsk/tc/')) {
    return `${catalogOrigin('tc')}${normalized}`;
  }
  if (
    normalized === '/minsk/bc' ||
    normalized.startsWith('/minsk/bc/') ||
    normalized === '/minsk/bcminsk' ||
    normalized.startsWith('/minsk/bcminsk/') ||
    isOfficesDistrictPath(normalized)
  ) {
    const pathOnOffices =
      normalized === '/rayon-minsk-mir'
        ? '/minsk/minsk-mir'
        : normalized.replace(/^\/minsk\/bcminsk/, '/minsk/bc');
    return `${catalogOrigin('bc')}${pathOnOffices}`;
  }
  return `${PLATFORM_ORIGIN}${normalized}`;
}

export function isCatalogPath(path) {
  return (
    path === '/minsk/bc' ||
    path.startsWith('/minsk/bc/') ||
    path === '/minsk/tc' ||
    path.startsWith('/minsk/tc/') ||
    isOfficesDistrictPath(path)
  );
}

/** Путь каталога БЦ / гида по районам на officelist. */
export function isOfficesCatalogPath(path) {
  return (
    path === '/minsk/bc' ||
    path.startsWith('/minsk/bc/') ||
    path === '/minsk/bcminsk' ||
    path.startsWith('/minsk/bcminsk/') ||
    isOfficesDistrictPath(path)
  );
}
