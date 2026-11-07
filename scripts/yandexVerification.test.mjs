import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendMissingYandexExtras, catalogYandexExtraCodes } from './domainSplit.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const META_RE = /<meta name="yandex-verification" content="([^"]*)" \/>/g;

/** Коды, которые уже были на production HEAD до этого коммита. */
const PREVIOUS = {
  malls: { yandex: '5893ee662c25f112', extra: ['ea3f37330e9500c7'] },
  offices: { yandex: '7055f1dec94e1e7e', extra: ['d36bf72f1ed53239'] },
};

function codesIn(html) {
  return [...html.matchAll(META_RE)].map((match) => match[1]);
}

function siteCodes(site) {
  const primary = site === 'malls' ? PREVIOUS.malls.yandex : PREVIOUS.offices.yandex;
  return [primary, ...catalogYandexExtraCodes(site)];
}

function grownSite() {
  const malls = catalogYandexExtraCodes('malls').length;
  const offices = catalogYandexExtraCodes('offices').length;
  if (malls === 2 && offices === 1) return 'malls';
  if (offices === 2 && malls === 1) return 'offices';
  throw new Error(`unexpected extra counts malls=${malls} offices=${offices}`);
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
  return readFileSync(join(cwd, 'dist/index.html'), 'utf8');
}

describe('verification marker на снимке каталога', () => {
  const site = grownSite();
  const other = site === 'malls' ? 'offices' : 'malls';
  const previous = [PREVIOUS[site].yandex, ...PREVIOUS[site].extra];
  const platformHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

  it('добавлен один код своего домена, два прежних и чужой список целы', () => {
    expect(catalogYandexExtraCodes(site).slice(0, 1)).toEqual(PREVIOUS[site].extra);
    expect(catalogYandexExtraCodes(site)).toHaveLength(2);
    expect(catalogYandexExtraCodes(other)).toEqual(PREVIOUS[other].extra);
    expect(codesIn(platformHtml)).toHaveLength(1);
  });

  it('корень: шелл сохраняет title, description и canonical, meta ровно три своих', () => {
    const script = site === 'malls' ? 'prepare-malls-shell.mjs' : 'prepare-offices-shell.mjs';
    const html = runShell(script, site);
    const found = codesIn(html);
    const title = site === 'malls' ? 'MallList — каталог торговых центров' : 'OfficeList — каталог бизнес-центров Минска';
    const canonical = site === 'malls' ? 'https://malllist.pro/minsk/tc' : 'https://officelist.pro/minsk/bc';
    expect(found.slice(0, 2)).toEqual(previous);
    expect(found).toHaveLength(3);
    expect(found).not.toContain(codesIn(platformHtml)[0]);
    for (const foreign of [PREVIOUS[other].yandex, ...PREVIOUS[other].extra]) {
      expect(found).not.toContain(foreign);
    }
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${canonical}" />`);
    expect(html).toContain('<meta name="description" content="');
    const withoutNew = html.replace(`<meta name="yandex-verification" content="${found[2]}" />\n`, '');
    expect(codesIn(withoutNew)).toEqual(previous);
    expect(withoutNew).not.toContain(found[2]);
  });

  it('карточка: допись prerender не меняет уже стоящие теги и текст', () => {
    const card = `<!doctype html><html><head><title>Карточка</title>
<meta name="yandex-verification" content="${previous[0]}" />
<meta name="yandex-verification" content="${previous[1]}" />
<meta name="description" content="Описание карточки без правок" />
<link rel="canonical" href="https://example.test/card" />
</head><body><h1>Карточка</h1><p>текст описания</p></body></html>`;
    const after = appendMissingYandexExtras(card, catalogYandexExtraCodes(site));
    const added = codesIn(after).filter((code) => !previous.includes(code));
    expect(added).toHaveLength(1);
    expect(codesIn(after).slice(0, 2)).toEqual(previous);
    const stripped = after.replace(`<meta name="yandex-verification" content="${added[0]}" />\n`, '');
    expect(stripped).toBe(card);
    expect(after).toContain('Описание карточки без правок');
    expect(after).toContain('https://example.test/card');
    const prerender = readFileSync(resolve(ROOT, 'scripts/prerender.mjs'), 'utf8');
    expect(prerender).toContain('out = appendMissingYandexExtras(out);');
  });
});
