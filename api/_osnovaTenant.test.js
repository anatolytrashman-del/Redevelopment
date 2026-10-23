import { describe, expect, it } from 'vitest';
import { getClientFromRequest, getClientSlugForHost } from './_osnovaTenant.js';

function makeReq(host, cookie = '', url = '/') {
  return {
    headers: { host, cookie, 'x-forwarded-host': host },
    url,
  };
}

describe('_osnovaTenant (server)', () => {
  it('прод-хост матрёшки', () => {
    const r = getClientFromRequest(makeReq('osnova.redevelopment.pro'));
    expect(r.slug).toBe('matreshka');
    expect(r.isPreviewOverride).toBe(false);
  });

  it('не клиент — null', () => {
    const r = getClientFromRequest(makeReq('redevelopment.pro'));
    expect(r.slug).toBeNull();
  });

  it('preview override по cookie только если VERCEL_ENV=preview', () => {
    const prev = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'preview';
    const r = getClientFromRequest(makeReq('vercel-foo.vercel.app', 'osnova_preview=1'));
    expect(r.slug).toBe('matreshka');
    expect(r.isPreviewOverride).toBe(true);
    process.env.VERCEL_ENV = prev;
  });

  it('preview override не работает на проде', () => {
    const prev = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    const r = getClientFromRequest(makeReq('vercel-foo.vercel.app', 'osnova_preview=1'));
    expect(r.slug).toBeNull();
    process.env.VERCEL_ENV = prev;
  });

  it('getClientSlugForHost exposed', () => {
    expect(getClientSlugForHost('xn--80ad6adbq.redevelopment.pro')).toBe('matreshka');
  });
});
