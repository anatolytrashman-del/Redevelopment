// Последний шаг сборки (ТЗ индексации, 2026-10-20). Только техника, без
// видимых изменений:
// 1) Убирает ПУСТЫЕ <script type="application/ld+json" id="…"></script> из
//    уже отрисованных (пререндер) страниц. Пустой JSON-LD Google Search
//    Console считает «Unparsable structured data». В SPA-шеллах (пустой
//    #root) плейсхолдеры оставляем — их заполняет клиент (lib/pageMeta.ts),
//    у каждой функции там есть проверка `if (!ld) return`.
// 2) Пишет dist/sitemap-index.xml (sitemapindex) для каталожных доменов —
//    на него ссылается robots.txt (middleware.ts).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEPLOYED_SITE_MODE, MALLS_ORIGIN, OFFICES_ORIGIN, PLATFORM_ORIGIN } from './domainSplit.mjs';

const DIST = resolve(process.cwd(), 'dist');
if (!existsSync(DIST)) {
  console.warn('[finalize-seo] нет dist/ — пропуск');
  process.exit(0);
}

const EMPTY_LD = /[ \t]*<script type="application\/ld\+json"(?: id="[^"]*")?>\s*<\/script>\n?/g;
const EMPTY_ROOT = /<div id="root">\s*<\/div>/;

export function stripEmptyJsonLd(html) {
  if (EMPTY_ROOT.test(html)) return html;
  return html.replace(EMPTY_LD, '');
}

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith('.html')) yield p;
  }
}

let changed = 0;
let scanned = 0;
for (const file of htmlFiles(DIST)) {
  scanned++;
  const html = readFileSync(file, 'utf8');
  const next = stripEmptyJsonLd(html);
  if (next !== html) {
    writeFileSync(file, next);
    changed++;
  }
}
console.log(`[finalize-seo] пустые JSON-LD убраны в ${changed} из ${scanned} HTML`);

const origin =
  DEPLOYED_SITE_MODE === 'offices' ? OFFICES_ORIGIN : DEPLOYED_SITE_MODE === 'malls' ? MALLS_ORIGIN : PLATFORM_ORIGIN;
const maps = DEPLOYED_SITE_MODE === 'platform' ? ['sitemap.xml', 'sitemap-old-urls.xml'] : ['sitemap.xml'];
const today = new Date().toISOString().slice(0, 10);
const entries = maps
  .filter((m) => existsSync(join(DIST, m)))
  .map((m) => `  <sitemap>\n    <loc>${origin}/${m}</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`);
writeFileSync(
  join(DIST, 'sitemap-index.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</sitemapindex>\n`,
);
console.log(`[finalize-seo] sitemap-index.xml (${DEPLOYED_SITE_MODE}): ${entries.length} карт`);
