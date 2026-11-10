import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import vercelConfig from '../../vercel.json';
import { crossDomainRedirect, robotsSitemapLine, siteIdForPath } from './sites';

const ROOT = resolve(import.meta.dirname, '../..');
const SITEMAP_PATH = resolve(ROOT, 'public/sitemap-old.xml');
const ROBOTS_PATH = resolve(ROOT, 'public/robots.txt');
const LASTMOD = '2026-11-07';
const LOC_RE = /^https:\/\/redevelopment\.pro\/minsk\/[a-z0-9./-]+$/;
/** SHA-256 списка из 748 URL в порядке файла-источника (2026-11-07). */
const URL_LIST_SHA256 = '33cf329202a8d71290eb21d45ff3bb7c274e9fe7fc42dc120b457cc99040dac3';

type VercelHas = { type: string; value: string };
type VercelRedirect = {
  source: string;
  destination: string;
  permanent?: boolean;
  has?: VercelHas[];
};
type VercelHeader = { source: string; headers: { key: string; value: string }[] };

const redirects = vercelConfig.redirects as VercelRedirect[];
const headers = vercelConfig.headers as VercelHeader[];

function vercelSourceRegex(source: string): RegExp {
  let out = '';
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('{/}?', i)) {
      out += '/?';
      i += 4;
      continue;
    }
    if (source[i] === ':') {
      const named = /^:([A-Za-z0-9_]+)(\*)?/.exec(source.slice(i));
      if (named) {
        out += named[2] ? '.*' : '[^/]+';
        i += named[0].length;
        continue;
      }
    }
    if (source[i] === '(') {
      const end = source.indexOf(')', i);
      out += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    const ch = source[i];
    out += /[\\^$.|+?{}[\]]/.test(ch) ? `\\${ch}` : ch;
    i += 1;
  }
  return new RegExp(`^${out}$`);
}

function appliesToHost(rule: VercelRedirect, host: string): boolean {
  const hosts = (rule.has ?? []).filter((item) => item.type === 'host').map((item) => item.value);
  return hosts.length === 0 || hosts.includes(host);
}

function catalogRedirectsFor(host: string): VercelRedirect[] {
  return redirects.filter(
    (rule) =>
      appliesToHost(rule, host) && /https:\/\/(?:malllist|officelist)\.pro\//.test(rule.destination),
  );
}

function parseSitemap(xml: string): { locs: string[]; lastmods: string[] } {
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')) {
    throw new Error('нет XML-декларации');
  }
  if (!xml.endsWith('</urlset>\n')) throw new Error('файл обрывается');
  const open = xml.match(/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/g) ?? [];
  const close = xml.match(/<\/urlset>/g) ?? [];
  if (open.length !== 1 || close.length !== 1) throw new Error('urlset должен быть один');
  const blocks = xml.match(/<url><loc>([^<]*)<\/loc><lastmod>([^<]*)<\/lastmod><\/url>/g) ?? [];
  const urlOpen = xml.match(/<url>/g) ?? [];
  const urlClose = xml.match(/<\/url>/g) ?? [];
  if (blocks.length !== urlOpen.length || blocks.length !== urlClose.length) {
    throw new Error('в sitemap есть url вне ожидаемой формы loc+lastmod');
  }
  const locs: string[] = [];
  const lastmods: string[] = [];
  for (const block of blocks) {
    const match = block.match(/<loc>([^<]*)<\/loc><lastmod>([^<]*)<\/lastmod>/);
    if (!match) throw new Error('битый url');
    locs.push(match[1]);
    lastmods.push(match[2]);
  }
  const reconstructed = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...locs.map((loc, index) => `  <url><loc>${loc}</loc><lastmod>${lastmods[index]}</lastmod></url>`),
    '</urlset>',
    '',
  ].join('\n');
  if (reconstructed !== xml) throw new Error('в sitemap есть лишний текст');
  return { locs, lastmods };
}

describe('sitemap-old.xml', () => {
  const xml = readFileSync(SITEMAP_PATH, 'utf8');
  const { locs, lastmods } = parseSitemap(xml);

  it('ровно 748 уникальных URL redevelopment.pro/minsk с lastmod 2026-11-07', () => {
    expect(locs).toHaveLength(748);
    expect(new Set(locs).size).toBe(748);
    expect(locs.every((loc) => LOC_RE.test(loc))).toBe(true);
    expect(new Set(lastmods)).toEqual(new Set([LASTMOD]));
    expect(createHash('sha256').update(locs.join('\n')).digest('hex')).toBe(URL_LIST_SHA256);
  });

  it('не содержит секретов и посторонних хостов', () => {
    expect(xml).not.toMatch(
      /service_role|SUPABASE_|BEGIN (?:RSA |OPENSSH |PRIVATE )|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+|sk_live_|AKIA[0-9A-Z]{16}/,
    );
    expect(xml).not.toMatch(/https?:\/\/(?!redevelopment\.pro\/|www\.sitemaps\.org\/)/);
    expect(locs.some((loc) => loc.includes('malllist.pro') || loc.includes('officelist.pro'))).toBe(false);
  });
});

describe('robots.txt платформы', () => {
  it('добавляет sitemap-old.xml и сохраняет прежние правила', () => {
    const robots = readFileSync(ROBOTS_PATH, 'utf8');
    const middleware = readFileSync(resolve(ROOT, 'middleware.ts'), 'utf8');
    const platformRobots = middleware.match(/const PLATFORM_ROBOTS = `([\s\S]*?)`;/);
    expect(platformRobots).not.toBeNull();
    const served = `${platformRobots?.[1] ?? ''}${robotsSitemapLine('redevelopment.pro')}\n`;
    expect(robots).toBe(served);
    expect(served).toContain('Disallow: /admin\nDisallow: /pitch\nDisallow: /*/draft\n');
    expect(served).toContain('Sitemap: https://redevelopment.pro/sitemap.xml\n');
    expect(served).toContain('Sitemap: https://redevelopment.pro/sitemap-old-urls.xml\n');
    expect(served).toContain('Sitemap: https://redevelopment.pro/sitemap-old.xml\n');
    expect(middleware).toContain('robotsSitemapLine(host)');
  });

  it('не подмешивает карту платформы в robots каталогов', () => {
    expect(robotsSitemapLine('malllist.pro')).toBe('Sitemap: https://malllist.pro/sitemap-index.xml');
    expect(robotsSitemapLine('officelist.pro')).toBe('Sitemap: https://officelist.pro/sitemap-index.xml');
    expect(robotsSitemapLine('www.malllist.pro')).not.toContain('sitemap-old.xml');
    expect(robotsSitemapLine('www.officelist.pro')).not.toContain('sitemap-old.xml');
  });
});

describe('308 каталогов не задевают sitemap-old и robots', () => {
  it('пути карты и robots остаются на платформе', () => {
    expect(siteIdForPath('/sitemap-old.xml')).toBe('platform');
    expect(siteIdForPath('/robots.txt')).toBe('platform');
    expect(crossDomainRedirect('redevelopment.pro', '/sitemap-old.xml')).toBeNull();
    expect(crossDomainRedirect('redevelopment.pro', '/robots.txt')).toBeNull();
    expect(crossDomainRedirect('www.redevelopment.pro', '/sitemap-old.xml')).toBe(
      'https://redevelopment.pro/sitemap-old.xml',
    );
    expect(crossDomainRedirect('www.redevelopment.pro', '/robots.txt')).toBe(
      'https://redevelopment.pro/robots.txt',
    );
  });

  it('постоянные 308 /minsk/tc и /minsk/bc на месте', () => {
    const tc = redirects.find(
      (rule) =>
        rule.source === '/minsk/tc/:path*' &&
        rule.has?.some((item) => item.type === 'host' && item.value === 'redevelopment.pro'),
    );
    const bc = redirects.find(
      (rule) =>
        rule.source === '/minsk/bc/:path*' &&
        rule.has?.some((item) => item.type === 'host' && item.value === 'redevelopment.pro'),
    );
    expect(tc).toMatchObject({
      destination: 'https://malllist.pro/minsk/tc/:path*',
      permanent: true,
    });
    expect(bc).toMatchObject({
      destination: 'https://officelist.pro/minsk/bc/:path*',
      permanent: true,
    });
    expect(vercelSourceRegex('/minsk/tc/:path*').test('/minsk/tc/palazzo')).toBe(true);
    expect(vercelSourceRegex('/minsk/bc/:path*').test('/minsk/bc/titan')).toBe(true);
    expect(crossDomainRedirect('redevelopment.pro', '/minsk/tc/palazzo')).toBe(
      'https://malllist.pro/minsk/tc/palazzo',
    );
    expect(crossDomainRedirect('redevelopment.pro', '/minsk/bc/titan')).toBe(
      'https://officelist.pro/minsk/bc/titan',
    );
  });

  it('ни одно междоменное правило redevelopment не матчит /robots.txt и /sitemap-old.xml', () => {
    for (const host of ['redevelopment.pro', 'www.redevelopment.pro']) {
      for (const rule of catalogRedirectsFor(host)) {
        expect(vercelSourceRegex(rule.source).test('/robots.txt'), `${host} ${rule.source}`).toBe(false);
        expect(vercelSourceRegex(rule.source).test('/sitemap-old.xml'), `${host} ${rule.source}`).toBe(false);
      }
    }
    const wwwApex = redirects.find(
      (rule) =>
        rule.source === '/(.*)' &&
        rule.has?.some((item) => item.type === 'host' && item.value === 'www.redevelopment.pro'),
    );
    expect(wwwApex).toMatchObject({
      destination: 'https://redevelopment.pro/$1',
      permanent: true,
    });
  });

  it('отдаёт sitemap-old.xml как application/xml', () => {
    const header = headers.find((item) => item.source === '/sitemap-old.xml');
    expect(header?.headers).toEqual(
      expect.arrayContaining([
        { key: 'Content-Type', value: 'application/xml; charset=utf-8' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
      ]),
    );
    const middleware = readFileSync(resolve(ROOT, 'middleware.ts'), 'utf8');
    expect(middleware).toMatch(/STATIC_FILE_EXTENSIONS = new Set\(\[[\s\S]*?'xml'/);
  });
});

describe('старые URL карт уходят одним 308 сразу на каталог', () => {
  function firstRedirect(host: string, pathname: string): VercelRedirect | undefined {
    return redirects.find(
      (rule) => appliesToHost(rule, host) && vercelSourceRegex(rule.source).test(pathname),
    );
  }

  it('ни одно правило /minsk/bcminsk не уводит обратно на redevelopment (без двух прыжков)', () => {
    for (const rule of redirects) {
      if (!rule.source.startsWith('/minsk/bcminsk')) continue;
      expect(rule.destination, rule.source).toMatch(/^https:\/\/officelist\.pro\//);
      expect(rule.permanent, rule.source).toBe(true);
    }
  });

  it('каждый URL sitemap-old.xml: первое правило — абсолютный 308 на malllist/officelist', () => {
    const { locs } = parseSitemap(readFileSync(SITEMAP_PATH, 'utf8'));
    for (const loc of locs) {
      const pathname = new URL(loc).pathname;
      const rule = firstRedirect('redevelopment.pro', pathname);
      expect(rule, loc).toBeDefined();
      expect(rule?.destination, loc).toMatch(/^https:\/\/(?:malllist|officelist)\.pro\//);
    }
  });

  it('шесть бывших двухшаговых цепочек идут сразу на officelist', () => {
    const cases: [string, string][] = [
      ['/minsk/bcminsk/abk-park', 'https://officelist.pro/minsk/bc/:path*'],
      ['/minsk/bcminsk/metro/vokzalnaya', 'https://officelist.pro/minsk/bc/:path*'],
      ['/minsk/bcminsk/metro/vostok', 'https://officelist.pro/minsk/bc/:path*'],
      ['/minsk/bcminsk/microrayon/chkalovsky', 'https://officelist.pro/minsk/bc/area/:slug'],
      ['/minsk/bcminsk/microrayon/raduzhny', 'https://officelist.pro/minsk/bc/area/:slug'],
      ['/minsk/bcminsk/ulitsa/logoyskiy-trakt', 'https://officelist.pro/minsk/bc/street/:slug'],
    ];
    for (const [pathname, destination] of cases) {
      expect(firstRedirect('redevelopment.pro', pathname)?.destination, pathname).toBe(destination);
    }
  });
});
