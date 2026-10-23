import { describe, expect, it } from 'vitest';
import { getClientFromRequest, getClientSlugForHost } from './_matreshkaTenant.js';
import { MATRESHKA_HOSTS } from '../src/lib/matreshkaHosts.js';

function makeReq(host, cookie = '', url = '/', extra = {}) {
  return {
    headers: { host, cookie, 'x-forwarded-host': host, ...extra },
    url,
  };
}

describe('_matreshkaTenant (server)', () => {
  it('прод-хосты «Матрешки»', () => {
    for (const h of MATRESHKA_HOSTS) {
      const r = getClientFromRequest(makeReq(h));
      expect(r.slug).toBe('matreshka');
      expect(r.isPreviewOverride).toBe(false);
    }
  });

  it('вход на «/» redevelopment.pro: заголовок root-login → клиент matreshka', () => {
    for (const h of ['redevelopment.pro', 'www.redevelopment.pro']) {
      const r = getClientFromRequest(makeReq(h, '', '/api/matreshka?route=auth.login', { 'x-matreshka-root-login': '1' }));
      expect(r.slug).toBe('matreshka');
      expect(r.isRootLogin).toBe(true);
    }
  });

  it('заголовок root-login не действует на чужих хостах и на проде vercel.app', () => {
    const prev = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    for (const h of ['officelist.pro', 'malllist.pro', 'evil.example', 'foo.vercel.app']) {
      const r = getClientFromRequest(makeReq(h, '', '/', { 'x-matreshka-root-login': '1' }));
      expect(r.slug).toBeNull();
    }
    process.env.VERCEL_ENV = prev;
  });

  it('не клиент — null', () => {
    const r = getClientFromRequest(makeReq('redevelopment.pro'));
    expect(r.slug).toBeNull();
  });

  it('preview override по cookie только если VERCEL_ENV=preview', () => {
    const prev = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'preview';
    const r = getClientFromRequest(makeReq('vercel-foo.vercel.app', 'matreshka_preview=1'));
    expect(r.slug).toBe('matreshka');
    expect(r.isPreviewOverride).toBe(true);
    process.env.VERCEL_ENV = prev;
  });

  it('preview override не работает на проде', () => {
    const prev = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    const r = getClientFromRequest(makeReq('vercel-foo.vercel.app', 'matreshka_preview=1'));
    expect(r.slug).toBeNull();
    process.env.VERCEL_ENV = prev;
  });

  it('getClientSlugForHost exposed', () => {
    expect(getClientSlugForHost(MATRESHKA_HOSTS[0])).toBe('matreshka');
  });
});
