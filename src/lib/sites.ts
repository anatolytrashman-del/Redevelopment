// Три публичных сайта в одном репозитории (2026-10-10):
//   redevelopment.pro — платформа сервисов в недвижимости (CRM, закупки, объекты);
//   officelist.pro    — каталог бизнес-центров (бывший /minsk/bc);
//   malllist.pro      — каталог торговых центров (бывший /minsk/tc).
//
// Пути каталогов пока те же (/minsk/bc/..., /minsk/tc/...) — 1:1 для SEO.
// Включение 301 и новых canonical — `enabled` (оба каталога) или точечно
// `redirects.malls` / `redirects.offices` в domain-split.json
// (см. docs/domain-split.md). Пока всё false, каталоги живут на платформе.
import domainSplit from '../data/domain-split.json';

// vite.config.ts define; объявлено здесь, потому что middleware.ts импортирует
// этот файл и tsconfig.middleware не подхватывает src/vite-env.d.ts.
declare const __DEPLOYED_SITE_MODE__: string | undefined;

export type PublicSiteId = 'platform' | 'offices' | 'malls';

export interface PublicSite {
  id: PublicSiteId;
  host: string;
  origin: string;
  brand: string;
  /** Корень каталога на этом сайте, если есть. */
  pathPrefix?: string;
}

const PLATFORM: PublicSite = {
  id: 'platform',
  host: domainSplit.platform.host,
  origin: domainSplit.platform.origin,
  brand: domainSplit.platform.brand,
};

const OFFICES: PublicSite = {
  id: 'offices',
  host: domainSplit.offices.host,
  origin: domainSplit.offices.origin,
  brand: domainSplit.offices.brand,
  pathPrefix: domainSplit.offices.pathPrefix,
};

const MALLS: PublicSite = {
  id: 'malls',
  host: domainSplit.malls.host,
  origin: domainSplit.malls.origin,
  brand: domainSplit.malls.brand,
  pathPrefix: domainSplit.malls.pathPrefix,
};

export const SITES = { platform: PLATFORM, offices: OFFICES, malls: MALLS } as const;

const redirects = (domainSplit as { redirects?: { malls?: boolean; offices?: boolean } }).redirects;

/** 301 /minsk/tc… → malllist.pro (или enabled на оба каталога). */
export const REDIRECT_MALLS_ENABLED = domainSplit.enabled === true || redirects?.malls === true;
/** 301 /minsk/bc… → officelist.pro (или enabled на оба каталога). */
export const REDIRECT_OFFICES_ENABLED = domainSplit.enabled === true || redirects?.offices === true;

/** true — хотя бы один каталог уехал на свой домен. */
export const CATALOG_DOMAIN_SPLIT_ENABLED = REDIRECT_MALLS_ENABLED || REDIRECT_OFFICES_ENABLED;

/** Нормализация значения env PUBLIC_SITE / VITE_PUBLIC_SITE. */
export function normalizeSiteMode(raw: string | undefined | null): PublicSiteId {
  const v = String(raw ?? 'platform')
    .trim()
    .toLowerCase();
  if (v === 'malls' || v === 'malllist' || v === 'tc') return 'malls';
  // officelist — канон; offiselist — старый алиас из черновика бренда
  if (v === 'offices' || v === 'officelist' || v === 'offiselist' || v === 'bc') return 'offices';
  return 'platform';
}

/**
 * Какой сайт собирает клиентский бандл.
 * Vercel → VITE_PUBLIC_SITE=malls|offices|platform (см. vite.config.ts define).
 * Edge middleware читает process.env.PUBLIC_SITE сам, без этой функции.
 */
export function deployedSiteMode(): PublicSiteId {
  const injected = typeof __DEPLOYED_SITE_MODE__ === 'string' ? __DEPLOYED_SITE_MODE__ : 'platform';
  return normalizeSiteMode(injected);
}

export function catalogSiteOrigin(kind: 'bc' | 'tc'): string {
  const mode = deployedSiteMode();
  // Отдельный проект каталога — canonical сразу на свой домен, даже если
  // глобальный рубильник domain-split ещё false (платформа не редиректит).
  if (mode === 'malls') return MALLS.origin;
  if (mode === 'offices') return OFFICES.origin;
  if (kind === 'tc' && REDIRECT_MALLS_ENABLED) return MALLS.origin;
  if (kind === 'bc' && REDIRECT_OFFICES_ENABLED) return OFFICES.origin;
  return PLATFORM.origin;
}

export function catalogSiteUrl(kind: 'bc' | 'tc'): string {
  const prefix = kind === 'tc' ? '/minsk/tc' : '/minsk/bc';
  return `${catalogSiteOrigin(kind)}${prefix}`;
}

/** Абсолютный URL страницы каталога (path начинается с /). */
export function absoluteCatalogUrl(kind: 'bc' | 'tc', path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${catalogSiteOrigin(kind)}${normalized}`;
}

export function platformOrigin(): string {
  return PLATFORM.origin;
}

/** Гид по району и посадочные (/minsk/minsk-mir…) — на officelist. */
export function isOfficesDistrictPath(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return path === '/minsk/minsk-mir' || path.startsWith('/minsk/minsk-mir/') || path === '/rayon-minsk-mir';
}

/** Какой сайт обслуживает pathname (по префиксу пути). */
export function siteIdForPath(pathname: string): PublicSiteId {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (path === '/minsk/tc' || path.startsWith('/minsk/tc/')) return 'malls';
  if (
    path === '/minsk/bc' ||
    path.startsWith('/minsk/bc/') ||
    path === '/minsk/bcminsk' ||
    path.startsWith('/minsk/bcminsk/') ||
    path === '/bc' ||
    path.startsWith('/bc/') ||
    isOfficesDistrictPath(path)
  ) {
    return 'offices';
  }
  return 'platform';
}

/** Абсолютный URL публичного пути на «своём» домене после сплита. */
export function absolutePublicUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const siteId = siteIdForPath(normalized);
  if (siteId === 'offices' && REDIRECT_OFFICES_ENABLED) return `${OFFICES.origin}${normalized}`;
  if (siteId === 'malls' && REDIRECT_MALLS_ENABLED) return `${MALLS.origin}${normalized}`;
  if (deployedSiteMode() === 'offices' && siteId === 'offices') return `${OFFICES.origin}${normalized}`;
  if (deployedSiteMode() === 'malls' && siteId === 'malls') return `${MALLS.origin}${normalized}`;
  return `${PLATFORM.origin}${normalized}`;
}

/** Канонический путь на officelist (старые алиасы → /minsk/bc…, /minsk/minsk-mir). */
function canonicalizeOfficesPath(path: string): string {
  if (path === '/rayon-minsk-mir') return '/minsk/minsk-mir';
  return path.replace(/^\/minsk\/bcminsk/, '/minsk/bc').replace(/^\/bc(?=\/|$)/, '/minsk/bc');
}

/**
 * Куда 301-ить запрос с host+pathname при включённом сплите.
 * null — редирект не нужен (уже на своём домене или путь платформы).
 */
export function crossDomainRedirect(host: string, pathname: string): string | null {
  if (!CATALOG_DOMAIN_SPLIT_ENABLED) return null;

  const bare = host.replace(/^www\./, '').toLowerCase();
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const siteId = siteIdForPath(path);
  const isWww = host.toLowerCase().startsWith('www.');

  // Каталоги раньше www→apex: иначе www.redevelopment.pro/minsk/tc даёт
  // два 301 (apex, потом malllist). Поисковики хотят один hop.
  // Каталог БЦ на платформе или на чужом каталожном домене → officelist
  if (siteId === 'offices') {
    if (!REDIRECT_OFFICES_ENABLED) {
      // offices ещё не уехал — ниже схлопнем www→apex при необходимости
    } else if (bare === OFFICES.host) {
      const canonical = canonicalizeOfficesPath(path);
      if (canonical !== path) return `${OFFICES.origin}${canonical}`;
      if (isWww) return `${OFFICES.origin}${pathname}`;
      return null;
    } else {
      return `${OFFICES.origin}${canonicalizeOfficesPath(path)}`;
    }
  }

  // Каталог ТЦ на платформе или на officelist → malllist
  if (siteId === 'malls') {
    if (!REDIRECT_MALLS_ENABLED) {
      // malls ещё не уехал
    } else if (bare === MALLS.host) {
      if (isWww) return `${MALLS.origin}${pathname}`;
      return null;
    } else {
      return `${MALLS.origin}${path}`;
    }
  }

  // www → apex на любом из трёх доменов (пути платформы / ещё не уехавшие каталоги)
  if (isWww && (bare === PLATFORM.host || bare === OFFICES.host || bare === MALLS.host)) {
    const target = bare === OFFICES.host ? OFFICES : bare === MALLS.host ? MALLS : PLATFORM;
    return `${target.origin}${pathname}`;
  }

  // На каталожных доменах чужой контент платформы → на платформу.
  // Корень обоих каталогов ведём в каталог города (отдельной главной пока нет).
  if (bare === OFFICES.host || bare === MALLS.host) {
    if (path === '/' || path === '') {
      if (bare === MALLS.host) {
        if (!REDIRECT_MALLS_ENABLED) return null;
        return `${MALLS.origin}${MALLS.pathPrefix!}`;
      }
      if (!REDIRECT_OFFICES_ENABLED) return null;
      return `${OFFICES.origin}${OFFICES.pathPrefix!}`;
    }
    // Статика, api, пререндер-ассеты — остаются; остальное платформенное — на платформу
    if (
      path.startsWith('/assets/') ||
      path.startsWith('/fonts/') ||
      path.startsWith('/images/') ||
      path.startsWith('/icons/') ||
      path.startsWith('/og/') ||
      path.startsWith('/data/') ||
      path.startsWith('/api/') ||
      path.startsWith('/_vercel/') ||
      path === '/robots.txt' ||
      path === '/sitemap.xml' ||
      path === '/favicon.ico' ||
      path === '/favicon.svg' ||
      path === '/favicon.png' ||
      path === '/apple-touch-icon.png' ||
      path === '/og-image.png' ||
      path.endsWith('.txt') ||
      path.endsWith('.xml') ||
      path.endsWith('.json') ||
      path.endsWith('.js') ||
      path.endsWith('.css') ||
      path.endsWith('.woff2') ||
      path.endsWith('.png') ||
      path.endsWith('.jpg') ||
      path.endsWith('.webp') ||
      path.endsWith('.svg')
    ) {
      return null;
    }
    return `${PLATFORM.origin}${pathname}`;
  }

  return null;
}

export function robotsSitemapLine(host: string): string {
  const bare = host.replace(/^www\./, '').toLowerCase();
  if (CATALOG_DOMAIN_SPLIT_ENABLED && bare === OFFICES.host) {
    return `Sitemap: ${OFFICES.origin}/sitemap.xml`;
  }
  if (CATALOG_DOMAIN_SPLIT_ENABLED && bare === MALLS.host) {
    return `Sitemap: ${MALLS.origin}/sitemap.xml`;
  }
  return `Sitemap: ${PLATFORM.origin}/sitemap.xml`;
}

/**
 * Прод-хост → id сайта для собственного счётчика посещаемости.
 * Превью/localhost → null (не пишем в page_views_daily).
 */
export function siteIdFromHostname(hostname: string): PublicSiteId | null {
  const bare = hostname.replace(/^www\./, '').toLowerCase();
  if (bare === PLATFORM.host) return 'platform';
  if (bare === MALLS.host) return 'malls';
  if (bare === OFFICES.host) return 'offices';
  return null;
}
