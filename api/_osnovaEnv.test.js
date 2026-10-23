import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { osnovaEnv, legacyCatalogEnv, OsnovaConfigError } from './_osnovaEnv.js';

describe('_osnovaEnv', () => {
  const orig = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...orig };
  });
  afterEach(() => {
    process.env = { ...orig };
  });

  it('osnovaEnv throws OsnovaConfigError with missing names when none set', () => {
    delete process.env.OSNOVA_SUPABASE_URL;
    delete process.env.OSNOVA_SUPABASE_ANON_KEY;
    delete process.env.OSNOVA_SUPABASE_SERVICE_ROLE_KEY;
    expect(() => osnovaEnv()).toThrow(OsnovaConfigError);
    try {
      osnovaEnv();
    } catch (e) {
      expect(e.missing).toContain('OSNOVA_SUPABASE_URL');
      expect(e.missing).toContain('OSNOVA_SUPABASE_ANON_KEY');
      expect(e.missing).toContain('OSNOVA_SUPABASE_SERVICE_ROLE_KEY');
    }
  });

  it('osnovaEnv succeeds when all three set, trims and strips trailing slash', () => {
    process.env.OSNOVA_SUPABASE_URL = ' https://ex.com/ ';
    process.env.OSNOVA_SUPABASE_ANON_KEY = '  ak  ';
    process.env.OSNOVA_SUPABASE_SERVICE_ROLE_KEY = ' sk ';
    const e = osnovaEnv();
    expect(e.url).toBe('https://ex.com');
    expect(e.anonKey).toBe('ak');
    expect(e.serviceKey).toBe('sk');
  });

  it('legacyCatalogEnv returns null if either missing, else {url,serviceKey}', () => {
    const prevU = process.env['SUPABASE' + '_URL'];
    const prevS = process.env['SUPABASE' + '_SERVICE_ROLE_KEY'];
    delete process.env['SUPABASE' + '_URL'];
    delete process.env['SUPABASE' + '_SERVICE_ROLE_KEY'];
    expect(legacyCatalogEnv()).toBe(null);
    process.env['SUPABASE' + '_URL'] = prevU || 'u';
    expect(legacyCatalogEnv()).toBe(null);
    process.env['SUPABASE' + '_SERVICE_ROLE_KEY'] = prevS || 's';
    const l = legacyCatalogEnv();
    expect(l && l.url).toBeTruthy();
  });

  it('does not contain old hardcoded values', () => {
    // module itself
    const src = require('fs').readFileSync(require('path').resolve(__dirname, '_osnovaEnv.js'), 'utf8');
    expect(src).not.toMatch(/iohcdylttyuhwovztrbk/);
    expect(src).not.toMatch(/sb_publishable_/);
  });
});
