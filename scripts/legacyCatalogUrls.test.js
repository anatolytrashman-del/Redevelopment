import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEGACY_STREET_SLUGS, newCatalogPath, rewriteLegacyCatalogUrls } from './legacyCatalogUrls.mjs';

// Переезд каталога /minsk/bcminsk → /minsk/bc (2026-09-23). Схема живёт в двух
// местах — 301-редиректы vercel.json и перепись ссылок в скопированных с
// прода снапшотах (legacyCatalogUrls.mjs); тест держит их одинаковыми.

const redirects = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).redirects.filter(
  (r) => !r.has,
);

// Минимальный разбор синтаксиса source у Vercel в той части, что мы
// используем: `:name`, `:name*` и необязательный хвостовой `{/}?`.
function compile(source) {
  const pattern = source
    .replace(/\{\/\}\?$/, '(?:/)?')
    .replace(/\/:(\w+)\*/g, '(?:/(?<$1>[^/]+(?:/[^/]+)*))?') // как у Vercel: хвостовой слэш `:path*` не съедает
    .replace(/:(\w+)/g, '(?<$1>[^/]+)');
  return new RegExp(`^${pattern}$`);
}

function applyRedirect(path) {
  for (const r of redirects) {
    const m = path.match(compile(r.source));
    if (!m) continue;
    return r.destination.replace(/:(\w+)\*?/g, (_s, name) => m.groups?.[name] ?? '').replace(/\/$/, '');
  }
  return null;
}

const OLD_PATHS = [
  '/minsk/bcminsk',
  '/minsk/bcminsk/futuris',
  '/minsk/bcminsk/ul-sverdlova-2',
  '/minsk/bcminsk/port-2',
  '/minsk/bcminsk/reyting',
  '/minsk/bcminsk/rating',
  '/minsk/bcminsk/rating/samye-dostupnye',
  '/minsk/bcminsk/rating/samye-bolshie',
  '/minsk/bcminsk/rating/b-plus',
  '/minsk/bcminsk/rating/b-c',
  '/minsk/bcminsk/analytics',
  '/minsk/bcminsk/gid',
  '/minsk/bcminsk/stroyashchiesya',
  '/minsk/bcminsk/class/b-plus',
  '/minsk/bcminsk/raion/tsentralny',
  '/minsk/bcminsk/class/a/raion/tsentralny',
  '/minsk/bcminsk/metro/moskovskaya',
  '/minsk/bcminsk/microrayon/komarovka',
  '/minsk/bcminsk/microrayon/grushevka',
  '/minsk/bcminsk/microrayon/suharevo',
  '/minsk/bcminsk/ulitsa/logoyskiy-trakt',
  ...Object.keys(LEGACY_STREET_SLUGS).map((s) => `/minsk/bcminsk/ulitsa/${s}`),
];

describe('переезд каталога БЦ на /minsk/bc', () => {
  it('301 из vercel.json ведёт туда же, куда перепись снапшотов, — одним прыжком', () => {
    for (const path of OLD_PATHS) {
      const expected = newCatalogPath(path.slice('/minsk/bcminsk'.length).split('/'));
      expect(applyRedirect(path), path).toBe(expected);
      expect(applyRedirect(`${path}/`), `${path}/`).toBe(expected);
      // Цель редиректа — конечная: второго прыжка нет.
      expect(applyRedirect(expected), expected).toBeNull();
    }
  });

  it('слитая карточка ведёт на итоговую одним прыжком', () => {
    expect(applyRedirect('/minsk/bc/port-2')).toBe('/minsk/bc/port');
    expect(applyRedirect('/minsk/bc/port-2/')).toBe('/minsk/bc/port');
    expect(applyRedirect('/minsk/bc/port')).toBeNull();
  });

  it('новые адреса выглядят как согласовано', () => {
    const map = Object.fromEntries(OLD_PATHS.map((p) => [p, newCatalogPath(p.slice('/minsk/bcminsk'.length).split('/'))]));
    expect(map['/minsk/bcminsk']).toBe('/minsk/bc');
    expect(map['/minsk/bcminsk/stroyashchiesya']).toBe('/minsk/bc/new');
    expect(map['/minsk/bcminsk/gid']).toBe('/minsk/bc/guide');
    expect(map['/minsk/bcminsk/rating/samye-dostupnye']).toBe('/minsk/bc/rating/affordable');
    expect(map['/minsk/bcminsk/raion/tsentralny']).toBe('/minsk/bc/district/tsentralny');
    expect(map['/minsk/bcminsk/class/a/raion/tsentralny']).toBe('/minsk/bc/class/a/district/tsentralny');
    expect(map['/minsk/bcminsk/microrayon/komarovka']).toBe('/minsk/bc/area/komarovka');
    expect(map['/minsk/bcminsk/ulitsa/ul-surganova']).toBe('/minsk/bc/street/surganova');
    expect(map['/minsk/bcminsk/ulitsa/pr-t-nezavisimosti']).toBe('/minsk/bc/street/prospekt-nezavisimosti');
    expect(map['/minsk/bcminsk/ulitsa/per-kozlova']).toBe('/minsk/bc/street/pereulok-kozlova');
    expect(map['/minsk/bcminsk/futuris']).toBe('/minsk/bc/futuris');
    expect(map['/minsk/bcminsk/port-2']).toBe('/minsk/bc/port');
  });

  it('словарь улиц совпадает с тем, что строит приложение', () => {
    const hubs = readFileSync(new URL('../src/lib/businessCenterHubs.ts', import.meta.url), 'utf8');
    for (const slug of Object.values(LEGACY_STREET_SLUGS)) expect(hubs).toContain(`'${slug}'`);
  });

  it('перепись HTML трогает только пути каталога', () => {
    const html =
      '<a href="/minsk/bcminsk/gid">гид</a><a href="https://redevelopment.pro/minsk/bcminsk/">каталог</a>' +
      '<meta content="https://redevelopment.pro/og/minsk-bcminsk-a-100.png"><a href="/minsk/minsk-mir">';
    expect(rewriteLegacyCatalogUrls(html)).toBe(
      '<a href="/minsk/bc/guide">гид</a><a href="https://redevelopment.pro/minsk/bc">каталог</a>' +
        '<meta content="https://redevelopment.pro/og/minsk-bcminsk-a-100.png"><a href="/minsk/minsk-mir">',
    );
  });
});
