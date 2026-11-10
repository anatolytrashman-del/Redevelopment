import { afterEach, describe, expect, it, vi } from 'vitest';
import middleware, {
  __resetCatalogSlugCache,
  catalogGoneCandidate,
  parseCatalogSlugs,
  TC_STORE_JUNK_SLUGS,
} from '../../middleware';
// @ts-expect-error — .mjs без типов
import { redirectAliases } from '../../scripts/generate-catalog-slugs.mjs';

// Удалённые карточки каталогов → 410, мусорные «бренды» → 410 (аудит SEO 2026-11-10).
const saved = process.env.PUBLIC_SITE;
const many = (p: string) => Array.from({ length: 60 }, (_, i) => `${p}-${i}`);
const SLUGS = {
  tc: ['siluet-tc', 'green-city-tc', ...many('tc')],
  bc: ['abk-park', 'port', ...many('bc')],
  aliases: { tc: [], bc: ['port-2', 'reyting', 'stroyashchiesya', 'gid'] },
};

afterEach(() => {
  process.env.PUBLIC_SITE = saved;
  vi.unstubAllGlobals();
  __resetCatalogSlugCache();
});

function stubFetch(body: unknown, contentType = 'application/json') {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { headers: { 'content-type': contentType } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function call(mode: string, host: string, path: string) {
  process.env.PUBLIC_SITE = mode;
  const res = await middleware(new Request(`https://${host}${path}`, { headers: { host } }));
  return res.status;
}

describe('catalogGoneCandidate', () => {
  it('malllist: /minsk/tc/store и мусорные бренды — сразу 410, карточки — проверка', () => {
    expect(catalogGoneCandidate('malls', '/minsk/tc/store')).toEqual({ gone: true });
    expect(catalogGoneCandidate('malls', '/minsk/tc/store/tualet')).toEqual({ gone: true });
    expect(catalogGoneCandidate('malls', '/minsk/tc/store/qiwi')).toEqual({ gone: true });
    expect(catalogGoneCandidate('malls', '/minsk/tc/store/zara')).toBeNull();
    expect(catalogGoneCandidate('malls', '/minsk/tc/siluet-tc')).toEqual({ slug: 'siluet-tc', kind: 'tc' });
    expect(catalogGoneCandidate('malls', '/minsk/tc/rating')).toBeNull();
    expect(catalogGoneCandidate('malls', '/minsk/tc/with/metro')).toBeNull();
    expect(catalogGoneCandidate('malls', '/privacy')).toBeNull();
  });

  it('officelist: карточки БЦ — проверка, разделы — нет', () => {
    expect(catalogGoneCandidate('offices', '/minsk/bc/depart')).toEqual({ slug: 'depart', kind: 'bc' });
    for (const s of ['new', 'rating', 'guide', 'analytics']) expect(catalogGoneCandidate('offices', `/minsk/bc/${s}`)).toBeNull();
    expect(catalogGoneCandidate('offices', '/minsk/bc/metro/nemiga')).toBeNull();
    expect(catalogGoneCandidate('platform', '/minsk/bc/depart')).toBeNull();
  });

  it('список мусорных брендов без настоящих магазинов', () => {
    for (const s of ['zara', 'gold-apple', 'sportmaster', 'belarusbank', 'ozon']) expect(TC_STORE_JUNK_SLUGS.has(s)).toBe(false);
    for (const s of ['tualet', 'bankomat', 'veloparkovka', 'qiwi']) expect(TC_STORE_JUNK_SLUGS.has(s)).toBe(true);
  });
});

describe('middleware: 410 по списку живых slug', () => {
  it('malllist: живая карточка — дальше, удалённая — 410', async () => {
    stubFetch(SLUGS);
    expect(await call('malls', 'malllist.pro', '/minsk/tc/siluet-tc')).toBe(200);
    expect(await call('malls', 'malllist.pro', '/minsk/tc/zzz-net-takogo')).toBe(410);
    expect(await call('malls', 'malllist.pro', '/minsk/tc/zzz-net-takogo/')).toBe(410);
    expect(await call('malls', 'malllist.pro', '/minsk/tc/store')).toBe(410);
    expect(await call('malls', 'malllist.pro', '/minsk/tc/store/tualet')).toBe(410);
    expect(await call('malls', 'malllist.pro', '/minsk/tc/store/zara')).toBe(200);
  });

  it('officelist: depart/metodika — 410, живые и алиасы редиректов — дальше', async () => {
    stubFetch(SLUGS);
    expect(await call('offices', 'officelist.pro', '/minsk/bc/depart')).toBe(410);
    expect(await call('offices', 'officelist.pro', '/minsk/bc/metodika')).toBe(410);
    expect(await call('offices', 'officelist.pro', '/minsk/bc/abk-park')).toBe(200);
    expect(await call('offices', 'officelist.pro', '/minsk/bc/port-2')).toBe(200);
    expect(await call('offices', 'officelist.pro', '/minsk/bc/new')).toBe(200);
  });

  it('410-страница: noindex и ссылки на каталог', async () => {
    stubFetch(SLUGS);
    process.env.PUBLIC_SITE = 'offices';
    const res = await middleware(new Request('https://officelist.pro/minsk/bc/depart', { headers: { host: 'officelist.pro' } }));
    expect(res.status).toBe(410);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    const html = await res.text();
    expect(html).toContain('noindex');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/minsk/bc/rating"');
  });

  it('fail-open: нет файла (html вместо json), сбой сети, мало данных — не режем', async () => {
    stubFetch('<!doctype html>', 'text/html');
    expect(await call('malls', 'malllist.pro', '/minsk/tc/zzz')).toBe(200);
    __resetCatalogSlugCache();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net'); }));
    expect(await call('malls', 'malllist.pro', '/minsk/tc/zzz')).toBe(200);
    __resetCatalogSlugCache();
    stubFetch({ tc: ['a'], bc: ['b'] });
    expect(await call('offices', 'officelist.pro', '/minsk/bc/zzz')).toBe(200);
    expect(parseCatalogSlugs(null)).toBeNull();
  });

  it('список кэшируется в изоляте', async () => {
    const fn = stubFetch(SLUGS);
    await call('malls', 'malllist.pro', '/minsk/tc/siluet-tc');
    await call('malls', 'malllist.pro', '/minsk/tc/green-city-tc');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('generate-catalog-slugs: алиасы из vercel.json', () => {
  it('берёт только одиночные сегменты /minsk/(tc|bc)/<slug>', () => {
    const a = redirectAliases({
      redirects: [
        { source: '/minsk/bc/port-2{/}?', destination: '/minsk/bc/port' },
        { source: '/minsk/bc/area/grushevka{/}?', destination: '/x' },
        { source: '/minsk/tc/:path*', destination: '/x' },
        { source: '/minsk/bc/reyting', destination: '/minsk/bc/rating' },
        { source: '/minsk/bc/depart{/}?', has: [{ type: 'host', value: 'redevelopment.pro' }], destination: 'https://officelist.pro/' },
      ],
    });
    expect(a).toEqual({ tc: [], bc: ['port-2', 'reyting'] });
  });
});
