import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyYandexVerificationMetas, catalogYandexCodes } from './domainSplit.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const META_RE = /<meta\s+name="yandex-verification"\s+content="([^"]*)"/gi;

function codesIn(html) {
  return [...html.matchAll(META_RE)].map((match) => match[1]);
}

/** Два meta, которые уже стояли на main до этого выпуска. */
const PREVIOUS_CODES = {
  malls: ['5893ee662c25f112', 'ea3f37330e9500c7'],
  offices: ['7055f1dec94e1e7e', 'd36bf72f1ed53239'],
};

function historicalCodes(site) {
  return PREVIOUS_CODES[site];
}

function cardHtml(title, canonical, existing) {
  const metas = existing
    .map((code) => `<meta name="yandex-verification" content="${code}" />`)
    .join('\n');
  return `<!doctype html><html><head><title>${title}</title>\n${metas}\n<link rel="canonical" href="${canonical}" /></head><body><h1>${title}</h1></body></html>`;
}

function expectSiteHead(html, site) {
  const codes = catalogYandexCodes(site);
  const other = site === 'malls' ? 'offices' : 'malls';
  const found = codesIn(html);
  expect(codes).toHaveLength(3);
  expect(new Set(codes).size).toBe(3);
  expect(codes.slice(0, historicalCodes(site).length)).toEqual(historicalCodes(site));
  expect(found).toEqual(codes);
  const head = html.slice(html.indexOf('<head'), html.indexOf('</head>'));
  expect(codesIn(head)).toEqual(codes);
  for (const foreign of catalogYandexCodes(other)) {
    expect(html.includes(foreign)).toBe(false);
  }
  return codes;
}

function runShell(script, site) {
  const cwd = mkdtempSync(join(tmpdir(), 'yv-'));
  mkdirSync(join(cwd, 'dist'));
  copyFileSync(resolve(ROOT, 'index.html'), join(cwd, 'dist/index.html'));
  const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts', script)], {
    cwd,
    env: { ...process.env, PUBLIC_SITE: site, VITE_PUBLIC_SITE: site },
    encoding: 'utf8',
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return {
    index: readFileSync(join(cwd, 'dist/index.html'), 'utf8'),
    notFound: readFileSync(join(cwd, 'dist/404.html'), 'utf8'),
  };
}

describe('yandex-verification каталогов', () => {
  const platformHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  const platformCodes = codesIn(platformHtml);

  it('тег redevelopment в index.html один и скрипт платформы его не трогает', () => {
    expect(platformCodes).toHaveLength(1);
    expect(catalogYandexCodes('platform')).toEqual([]);
    expect(applyYandexVerificationMetas(platformHtml, [])).toBe(platformHtml);
  });

  it('корень malllist: шелл сборки, три своих meta, без чужих', () => {
    const { index, notFound } = runShell('prepare-malls-shell.mjs', 'malls');
    expectSiteHead(index, 'malls');
    expectSiteHead(notFound, 'malls');
    expect(index.includes(platformCodes[0])).toBe(false);
  });

  it('карточка malllist: тот же apply, что prerender', () => {
    const old = historicalCodes('malls');
    const card = cardHtml('Палаццо', 'https://malllist.pro/minsk/tc/palazzo', old);
    const html = applyYandexVerificationMetas(card, catalogYandexCodes('malls'));
    expectSiteHead(html, 'malls');
    expect(html).toContain('https://malllist.pro/minsk/tc/palazzo');
    expect(html).toContain('<h1>Палаццо</h1>');
    const fromPlatform = applyYandexVerificationMetas(platformHtml, catalogYandexCodes('malls'));
    expectSiteHead(fromPlatform, 'malls');
  });

  it('корень officelist: шелл сборки, три своих meta, без чужих', () => {
    const { index, notFound } = runShell('prepare-offices-shell.mjs', 'offices');
    expectSiteHead(index, 'offices');
    expectSiteHead(notFound, 'offices');
    expect(index.includes(platformCodes[0])).toBe(false);
  });

  it('карточка officelist: тот же apply, что prerender', () => {
    const old = historicalCodes('offices');
    const card = cardHtml('Титан', 'https://officelist.pro/minsk/bc/titan', old);
    const html = applyYandexVerificationMetas(card, catalogYandexCodes('offices'));
    expectSiteHead(html, 'offices');
    expect(html).toContain('https://officelist.pro/minsk/bc/titan');
    expect(html).toContain('<h1>Титан</h1>');
    const fromPlatform = applyYandexVerificationMetas(platformHtml, catalogYandexCodes('offices'));
    expectSiteHead(fromPlatform, 'offices');
  });

  it('повторная вставка не плодит meta, prerender вызывает тот же helper', () => {
    const once = applyYandexVerificationMetas(platformHtml, catalogYandexCodes('malls'));
    const twice = applyYandexVerificationMetas(once, catalogYandexCodes('malls'));
    expect(codesIn(twice)).toEqual(codesIn(once));
    const prerender = readFileSync(resolve(ROOT, 'scripts/prerender.mjs'), 'utf8');
    expect(prerender).toContain('applyYandexVerificationMetas(out, catalogYandexCodes())');
  });
});
