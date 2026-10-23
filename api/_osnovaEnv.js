export class OsnovaConfigError extends Error {
  missing;
  constructor(missing) {
    super(`osnova config missing: ${missing.join(',')}`);
    this.name = 'OsnovaConfigError';
    this.missing = missing || [];
  }
}

export function osnovaEnv() {
  const rawUrl = process.env.OSNOVA_SUPABASE_URL || '';
  const url = rawUrl.trim().replace(/\/$/, '');
  const anonKey = (process.env.OSNOVA_SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (process.env.OSNOVA_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const missing = [];
  if (!url) missing.push('OSNOVA_SUPABASE_URL');
  if (!anonKey) missing.push('OSNOVA_SUPABASE_ANON_KEY');
  if (!serviceKey) missing.push('OSNOVA_SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length > 0) {
    throw new OsnovaConfigError(missing);
  }
  return { url, anonKey, serviceKey };
}

export function legacyCatalogEnv() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}
