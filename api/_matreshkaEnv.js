export class MatreshkaConfigError extends Error {
  missing;
  constructor(missing) {
    super(`matreshka config missing: ${missing.join(',')}`);
    this.name = 'MatreshkaConfigError';
    this.missing = missing || [];
  }
}

export function matreshkaEnv() {
  const rawUrl = process.env.MATRESHKA_SUPABASE_URL || '';
  const url = rawUrl.trim().replace(/\/$/, '');
  const anonKey = (process.env.MATRESHKA_SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (process.env.MATRESHKA_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const missing = [];
  if (!url) missing.push('MATRESHKA_SUPABASE_URL');
  if (!anonKey) missing.push('MATRESHKA_SUPABASE_ANON_KEY');
  if (!serviceKey) missing.push('MATRESHKA_SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length > 0) {
    throw new MatreshkaConfigError(missing);
  }
  return { url, anonKey, serviceKey };
}

export function legacyCatalogEnv() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}
