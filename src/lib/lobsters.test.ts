import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  REDEVELOPMENT_TO_LOBSTERS_REDIRECT_ENABLED,
  isLobstersHost,
  lobstersPreviewState,
  lobstersRoute,
  redevelopmentToLobstersRedirect,
} from './lobsters';
import { isLobstersBrand, siteBrandName } from './siteBrand';
import { lobstersShell } from '../../scripts/generate-lobsters-shells.mjs';
import middleware from '../../middleware';

describe('isLobstersHost', () => {
  it('lobsters.pro и www — да; остальное — нет', () => {
    expect(isLobstersHost('lobsters.pro')).toBe(true);
    expect(isLobstersHost('WWW.Lobsters.pro:443')).toBe(true);
    expect(isLobstersHost('lobsters.pro.')).toBe(true);
    expect(isLobstersHost('r4s.lobsters.pro')).toBe(false);
    expect(isLobstersHost('gabex.lobsters.pro')).toBe(false);
    expect(isLobstersHost('redevelopment.pro')).toBe(false);
    expect(isLobstersHost('matreshka.redevelopment.pro')).toBe(false);
    expect(isLobstersHost('')).toBe(false);
  });
});

describe('lobstersRoute', () => {
  it('корень — заглушка, robots — свой', () => {
    expect(lobstersRoute('/')).toEqual({ type: 'stub' });
    expect(lobstersRoute('/robots.txt')).toEqual({ type: 'robots' });
  });
  it('www → 308 на апекс с путём и query', () => {
    expect(lobstersRoute('/admin/x', '?a=1', 'www.lobsters.pro')).toEqual({
      type: 'www',
      location: 'https://lobsters.pro/admin/x?a=1',
    });
  });
  it('/admin и /platform — шеллы Lobsters', () => {
    expect(lobstersRoute('/admin')).toEqual({ type: 'shell', path: '/lobsters-admin.html' });
    expect(lobstersRoute('/admin/')).toEqual({ type: 'shell', path: '/lobsters-admin.html' });
    expect(lobstersRoute('/admin/objects/12')).toEqual({ type: 'shell', path: '/lobsters-admin.html' });
    expect(lobstersRoute('/platform')).toEqual({ type: 'shell', path: '/lobsters-platform.html' });
    expect(lobstersRoute('/platform/clients')).toEqual({ type: 'shell', path: '/lobsters-platform.html' });
    expect(lobstersRoute('/administrator').type).toBe('notFound');
  });
  it('API, статика и токен-страницы — как есть', () => {
    for (const p of ['/api/x', '/_vercel/insights/script.js', '/assets/index-abc.js', '/brand/lobsters/logo.png', '/tz/abc', '/estimate/abc', '/plan/abc', '/summary/abc', '/favicon.ico', '/tz.html']) {
      expect(lobstersRoute(p).type, p).toBe('pass');
    }
  });
  it('публичные страницы Redevelopment — 301 на redevelopment.pro тот же путь', () => {
    expect(lobstersRoute('/minsk/bc', '?q=1')).toEqual({ type: 'redirect', location: 'https://redevelopment.pro/minsk/bc?q=1' });
    for (const p of ['/minsk', '/bc/x', '/favorites/1', '/zakupki', '/privacy', '/offer', '/requisites', '/license/zuev', '/one', '/redstorage', '/rayon-minsk-mir', '/business-upload', '/pitch/a', '/nl']) {
      expect(lobstersRoute(p).type, p).toBe('redirect');
    }
  });
  it('sitemap и неизвестное — 404', () => {
    expect(lobstersRoute('/sitemap.xml').type).toBe('notFound');
    expect(lobstersRoute('/sitemap-index.xml').type).toBe('notFound');
    expect(lobstersRoute('/foo').type).toBe('notFound');
    expect(lobstersRoute('/wp-login.php').type).toBe('notFound');
  });
});

describe('lobstersPreviewState', () => {
  it('?brand=lobsters включает и ставит cookie, ?brand=off снимает', () => {
    const on = lobstersPreviewState(new URLSearchParams('brand=lobsters'), '');
    expect(on.active).toBe(true);
    expect(on.setCookie).toContain('lobsters_preview=1');
    const off = lobstersPreviewState(new URLSearchParams('brand=off'), 'lobsters_preview=1');
    expect(off.active).toBe(false);
    expect(off.setCookie).toContain('Max-Age=0');
    expect(lobstersPreviewState(new URLSearchParams(''), 'a=b; lobsters_preview=1').active).toBe(true);
    expect(lobstersPreviewState(new URLSearchParams(''), 'lobsters_preview=10').active).toBe(false);
  });
});

describe('siteBrand', () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });
  it('без window — Redevelopment; шелл или хост lobsters.pro — Lobsters; иначе Redevelopment', () => {
    expect(isLobstersBrand()).toBe(false);
    g.window = { location: { hostname: 'redevelopment.pro' } };
    expect(siteBrandName()).toBe('Redevelopment');
    g.window = { location: { hostname: 'x.vercel.app' }, __SITE_BRAND__: 'lobsters' };
    expect(isLobstersBrand()).toBe(true);
    expect(siteBrandName()).toBe('Lobsters');
    g.window = { location: { hostname: 'lobsters.pro' } };
    expect(isLobstersBrand()).toBe(true);
  });
});

describe('lobstersShell', () => {
  const base = `<!doctype html><html><head>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>Redevelopment — платформа</title>
    <meta name="robots" content="noindex, nofollow">
    <meta property="og:site_name" content="Redevelopment" />
    <meta property="og:title" content="Redevelopment — платформа" />
    <meta property="og:image" content="https://redevelopment.pro/og-image.png" />
    <meta property="og:url" content="https://redevelopment.pro/minsk/one" />
    <meta name="twitter:image" content="https://redevelopment.pro/og-image.png" />
  </head><body><div id="root"></div></body></html>`;
  it('бренд, иконки, OG и noindex', () => {
    const out = lobstersShell(base, { title: 'Lobsters — платформа', description: 'Вход', path: '/platform' });
    expect(out).toContain('<title>Lobsters — платформа</title>');
    expect(out).toContain("window.__SITE_BRAND__='lobsters'");
    expect(out).toContain('content="Lobsters"');
    expect(out).toContain('https://lobsters.pro/brand/lobsters/og.png');
    expect(out).toContain('content="https://lobsters.pro/platform"');
    expect(out).toContain('noindex');
    expect(out).not.toContain('/favicon.svg');
    expect(out).not.toContain('redevelopment.pro');
    expect(out.match(/\/brand\/lobsters\/favicon\.ico/g)?.length).toBe(1);
  });
});

describe('middleware: lobsters.pro', () => {
  const prev = { PUBLIC_SITE: process.env.PUBLIC_SITE, VERCEL_ENV: process.env.VERCEL_ENV };
  beforeEach(() => {
    process.env.PUBLIC_SITE = 'platform';
    process.env.VERCEL_ENV = 'production';
  });
  afterEach(() => {
    process.env.PUBLIC_SITE = prev.PUBLIC_SITE;
    process.env.VERCEL_ENV = prev.VERCEL_ENV;
  });
  const req = (url: string, headers: Record<string, string> = {}) =>
    new Request(url, { headers: { host: new URL(url).host, ...headers } });
  const rewriteOf = (r: Response) => r.headers.get('x-middleware-rewrite') || '';

  it('/ на lobsters.pro — заглушка + noindex', async () => {
    const r = await middleware(req('https://lobsters.pro/'));
    expect(rewriteOf(r)).toContain('/lobsters-home.html');
  });
  it('/admin, /platform — шеллы Lobsters', async () => {
    expect(rewriteOf(await middleware(req('https://lobsters.pro/admin/objects')))).toContain('/lobsters-admin.html');
    expect(rewriteOf(await middleware(req('https://lobsters.pro/platform')))).toContain('/lobsters-platform.html');
  });
  it('каталог → 301 на redevelopment.pro, мусор → 404 Lobsters, robots — Disallow', async () => {
    const r = await middleware(req('https://lobsters.pro/minsk/bc'));
    expect(r.status).toBe(301);
    expect(r.headers.get('location')).toBe('https://redevelopment.pro/minsk/bc');
    const nf = await middleware(req('https://lobsters.pro/nope'));
    expect(nf.status).toBe(404);
    const html = await nf.text();
    expect(html).toContain('— Lobsters');
    expect(html).not.toContain('EVELOPMENT');
    expect(nf.headers.get('x-robots-tag')).toContain('noindex');
    const robots = await middleware(req('https://lobsters.pro/robots.txt'));
    const body = await robots.text();
    expect(body).toContain('Disallow: /');
    expect(body).not.toContain('Sitemap');
  });
  it('redevelopment.pro не меняется: корень, /admin, /platform', async () => {
    const root = await middleware(req('https://redevelopment.pro/'));
    expect(rewriteOf(root)).toBe('');
    expect(root.headers.get('x-middleware-next')).toBe('1');
    const admin = await middleware(req('https://redevelopment.pro/admin/objects'));
    expect(rewriteOf(admin)).toBe('');
    expect(admin.status).toBe(200);
    const platform = await middleware(req('https://redevelopment.pro/platform'));
    expect(rewriteOf(platform)).toBe('');
  });
  it('превью-cookie на проде игнорируется', async () => {
    const r = await middleware(req('https://redevelopment.pro/?brand=lobsters', { cookie: 'lobsters_preview=1' }));
    expect(rewriteOf(r)).toBe('');
  });
  it('на превью *.vercel.app ?brand=lobsters включает бренд и ставит cookie', async () => {
    process.env.VERCEL_ENV = 'preview';
    const r = await middleware(req('https://redevelopment-abc-trashman.vercel.app/?brand=lobsters'));
    expect(rewriteOf(r)).toContain('/lobsters-home.html');
    expect(r.headers.get('set-cookie') || '').toContain('lobsters_preview=1');
    const viaCookie = await middleware(req('https://redevelopment-abc-trashman.vercel.app/admin', { cookie: 'lobsters_preview=1' }));
    expect(rewriteOf(viaCookie)).toContain('/lobsters-admin.html');
    const off = await middleware(req('https://redevelopment-abc-trashman.vercel.app/admin?brand=off', { cookie: 'lobsters_preview=1' }));
    expect(off.status).toBe(302);
    expect(off.headers.get('set-cookie') || '').toContain('Max-Age=0');
  });
  it('хосты «Матрёшки» по-прежнему идут в matreshka.html', async () => {
    const r = await middleware(req('https://matreshka.redevelopment.pro/'));
    expect(rewriteOf(r)).toContain('/matreshka.html');
  });
});

describe('redevelopmentToLobstersRedirect (рубильник)', () => {
  it('по умолчанию выключен — redevelopment.pro/admin остаётся на месте', () => {
    expect(REDEVELOPMENT_TO_LOBSTERS_REDIRECT_ENABLED).toBe(false);
    expect(redevelopmentToLobstersRedirect('redevelopment.pro', '/admin', '')).toBeNull();
  });
  it('включённый: /admin*, /platform* → lobsters.pro тот же путь и query', () => {
    expect(redevelopmentToLobstersRedirect('redevelopment.pro', '/admin/objects', '?x=1', true)).toBe(
      'https://lobsters.pro/admin/objects?x=1',
    );
    expect(redevelopmentToLobstersRedirect('www.redevelopment.pro', '/platform', '', true)).toBe('https://lobsters.pro/platform');
  });
  it('включённый не трогает остальное: каталог, /nl, Матрёшку, превью', () => {
    expect(redevelopmentToLobstersRedirect('redevelopment.pro', '/', '', true)).toBeNull();
    expect(redevelopmentToLobstersRedirect('redevelopment.pro', '/minsk/bc', '', true)).toBeNull();
    expect(redevelopmentToLobstersRedirect('redevelopment.pro', '/nl', '', true)).toBeNull();
    expect(redevelopmentToLobstersRedirect('redevelopment.pro', '/administrator', '', true)).toBeNull();
    expect(redevelopmentToLobstersRedirect('matreshka.redevelopment.pro', '/admin', '', true)).toBeNull();
    expect(redevelopmentToLobstersRedirect('osnova.redevelopment.pro', '/platform', '', true)).toBeNull();
    expect(redevelopmentToLobstersRedirect('redevelopment-abc.vercel.app', '/admin', '', true)).toBeNull();
  });
});
