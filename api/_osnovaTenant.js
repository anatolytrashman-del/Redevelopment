// Серверный детектор клиентского тенанта (для api/osnova и middleware).
// Совпадает по логике с src/lib/tenant.ts, но без Vite-define и window.
// Превью-override: только process.env.VERCEL_ENV === 'preview' + cookie osnova_preview=1
// или ?tenant=osnova (для прямых запросов к api).

const CLIENT_HOSTS = {
  'xn--80ad6adbq.redevelopment.pro': 'matreshka',
  'основа.redevelopment.pro': 'matreshka',
  'osnova.redevelopment.pro': 'matreshka',
};

function normalizeHost(h) {
  return String(h || '').toLowerCase().replace(/^www\./, '');
}

function getClientSlugForHost(hostname) {
  const h = normalizeHost(hostname);
  return CLIENT_HOSTS[h] ?? null;
}

function isPreviewEnv() {
  return process.env.VERCEL_ENV === 'preview';
}

function hasPreviewCookie(req) {
  const cookie = req.headers.cookie || '';
  return cookie.includes('osnova_preview=1');
}

function hasPreviewParam(url) {
  try {
    return new URL(url, 'http://x').searchParams.get('tenant') === 'osnova';
  } catch {
    return false;
  }
}

export function getClientFromRequest(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const slug = getClientSlugForHost(host);
  if (slug) return { slug, isPreviewOverride: false };

  // override только на preview
  if (!isPreviewEnv()) return { slug: null, isPreviewOverride: false };

  const url = req.url || '';
  if (hasPreviewCookie(req) || hasPreviewParam(url)) {
    return { slug: 'matreshka', isPreviewOverride: true };
  }
  return { slug: null, isPreviewOverride: false };
}

export function isClientAdminHostFromRequest(req) {
  const { slug, isPreviewOverride } = getClientFromRequest(req);
  return Boolean(slug) || isPreviewOverride;
}

export { getClientSlugForHost };
