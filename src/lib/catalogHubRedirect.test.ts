import { afterEach, describe, expect, it, vi } from 'vitest';
import middleware, { __resetCatalogSlugCache } from '../../middleware';

// Хаб каталога на своём домене — «/» (аудит SEO 2026-11-10): /minsk/tc на
// malllist и /minsk/bc на officelist отдают один 308 на корень, старые
// карты redevelopment на каталогах — 404.
const saved = process.env.PUBLIC_SITE;
afterEach(() => {
  process.env.PUBLIC_SITE = saved;
  vi.unstubAllGlobals();
  __resetCatalogSlugCache();
});

function call(mode: string, host: string, path: string) {
  process.env.PUBLIC_SITE = mode;
  const res = middleware(new Request(`https://${host}${path}`, { headers: { host } })) as Response;
  return { status: res.status, location: res.headers.get('location') };
}

describe('хаб каталога → 308 на корень', () => {
  it('malllist: /minsk/tc, /minsk/tc/, /minsk — один 308 на /, query сохраняется', () => {
    expect(call('malls', 'malllist.pro', '/minsk/tc')).toEqual({ status: 308, location: 'https://malllist.pro/' });
    expect(call('malls', 'malllist.pro', '/minsk/tc/')).toEqual({ status: 308, location: 'https://malllist.pro/' });
    expect(call('malls', 'malllist.pro', '/minsk')).toEqual({ status: 308, location: 'https://malllist.pro/' });
    expect(call('malls', 'malllist.pro', '/minsk/tc?view=list')).toEqual({
      status: 308,
      location: 'https://malllist.pro/?view=list',
    });
    // Карточка проверяется по списку slug (Promise); без списка — fail-open.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    return Promise.resolve(middleware(new Request('https://malllist.pro/minsk/tc/gum', { headers: { host: 'malllist.pro' } }))).then((r) =>
      expect(r.status).toBe(200),
    );
  });

  it('officelist: /minsk/bc и /minsk — один 308 на /', () => {
    expect(call('offices', 'officelist.pro', '/minsk/bc')).toEqual({ status: 308, location: 'https://officelist.pro/' });
    expect(call('offices', 'officelist.pro', '/minsk/bc?status=built')).toEqual({
      status: 308,
      location: 'https://officelist.pro/?status=built',
    });
    expect(call('offices', 'officelist.pro', '/minsk')).toEqual({ status: 308, location: 'https://officelist.pro/' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    return Promise.resolve(middleware(new Request('https://officelist.pro/minsk/bc/abk-park', { headers: { host: 'officelist.pro' } }))).then((r) =>
      expect(r.status).toBe(200),
    );
  });

  it('sitemap-old*.xml на каталогах — 404, на платформе не трогаем', () => {
    for (const [mode, host] of [
      ['malls', 'malllist.pro'],
      ['offices', 'officelist.pro'],
    ]) {
      expect(call(mode, host, '/sitemap-old-urls.xml').status).toBe(404);
      expect(call(mode, host, '/sitemap-old.xml').status).toBe(404);
    }
    expect(call('platform', 'redevelopment.pro', '/sitemap-old-urls.xml').status).toBe(200);
  });
});
