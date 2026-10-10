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
  if (raw === 'offices' || raw === 'offiselist' || raw === 'bc') return 'offices';
  return 'platform';
}

export const DEPLOYED_SITE_MODE = deployedSiteMode();

export function catalogOrigin(kind) {
  if (DEPLOYED_SITE_MODE === 'malls') return MALLS_ORIGIN;
  if (DEPLOYED_SITE_MODE === 'offices') return OFFICES_ORIGIN;
  if (kind === 'tc' && REDIRECT_MALLS_ENABLED) return MALLS_ORIGIN;
  if (kind === 'bc' && REDIRECT_OFFICES_ENABLED) return OFFICES_ORIGIN;
  return PLATFORM_ORIGIN;
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
    normalized.startsWith('/minsk/bcminsk/')
  ) {
    return `${catalogOrigin('bc')}${normalized.replace(/^\/minsk\/bcminsk/, '/minsk/bc')}`;
  }
  return `${PLATFORM_ORIGIN}${normalized}`;
}

export function isCatalogPath(path) {
  return (
    path === '/minsk/bc' ||
    path.startsWith('/minsk/bc/') ||
    path === '/minsk/tc' ||
    path.startsWith('/minsk/tc/')
  );
}
