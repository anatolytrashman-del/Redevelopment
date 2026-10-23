// Серверный детектор клиентского тенанта «Матрешка» (для api/matreshka).
// Совпадает по логике с src/lib/tenant.ts, но без Vite-define и window.
// Хосты — из общего src/lib/matreshkaHosts.js.
// Режимы:
// - хост клиента (MATRESHKA_HOSTS) → клиент matreshka;
// - вход на «/» платформы: хост redevelopment.pro / www + заголовок x-matreshka-root-login: 1
//   (его шлёт только экран входа на «/»; без заголовка — платформенный режим, /platform не меняется);
// - превью-override: только VERCEL_ENV=preview на *.vercel.app + cookie matreshka_preview=1
//   или ?tenant=matreshka; там же заголовок root-login (симуляция хоста платформы).

import {
  MATRESHKA_CLIENT_SLUG,
  MATRESHKA_PREVIEW_FLAG,
  MATRESHKA_ROOT_LOGIN_HEADER,
  MATRESHKA_TENANT_PARAM,
  isPlatformLoginHost,
  isPreviewVercelHost,
  matreshkaSlugForHost,
} from '../src/lib/matreshkaHosts.js';

function getClientSlugForHost(hostname) {
  return matreshkaSlugForHost(hostname);
}

function hasPreviewCookie(req) {
  const cookie = req.headers.cookie || '';
  return cookie.includes(`${MATRESHKA_PREVIEW_FLAG}=1`);
}

function hasPreviewParam(url) {
  try {
    return new URL(url, 'http://x').searchParams.get('tenant') === MATRESHKA_TENANT_PARAM;
  } catch {
    return false;
  }
}

function hasRootLoginHeader(req) {
  return String(req.headers[MATRESHKA_ROOT_LOGIN_HEADER] || '') === '1';
}

export function getClientFromRequest(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const slug = getClientSlugForHost(host);
  if (slug) return { slug, isPreviewOverride: false, isRootLogin: false };

  const preview = isPreviewVercelHost(host, process.env.VERCEL_ENV);

  if (hasRootLoginHeader(req) && (isPlatformLoginHost(host) || preview)) {
    return { slug: MATRESHKA_CLIENT_SLUG, isPreviewOverride: preview, isRootLogin: true };
  }

  // override только на preview
  if (!preview) return { slug: null, isPreviewOverride: false, isRootLogin: false };

  if (hasPreviewCookie(req) || hasPreviewParam(req.url || '')) {
    return { slug: MATRESHKA_CLIENT_SLUG, isPreviewOverride: true, isRootLogin: false };
  }
  return { slug: null, isPreviewOverride: false, isRootLogin: false };
}

export function isClientAdminHostFromRequest(req) {
  const { slug, isPreviewOverride } = getClientFromRequest(req);
  return Boolean(slug) || isPreviewOverride;
}

export { getClientSlugForHost };
