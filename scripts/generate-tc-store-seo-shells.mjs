// SEO-шеллы подборок «ТЦ с магазином X» (/minsk/tc/store/<slug>).
//
// Магазины не пререндерятся headless'ом (тысячи URL). С 2026-10-07 они же
// вне sitemap и в noindex — чтобы отдать crawl budget карточкам ТЦ; шелл
// всё равно нужен людям по прямой ссылке (title/og/canonical/h1 вместо
// фолбэка Red One). Тот же приём, что у admin-shells: клонируем index.html
// в dist/minsk/tc/store/<slug>/index.html. React при монтировании сносит
// содержимое #root.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectTcStoreHubs } from './_tcPaths.mjs';
import { catalogOrigin, DEPLOYED_SITE_MODE, REDIRECT_MALLS_ENABLED } from './domainSplit.mjs';

// На платформе после переезда ТЦ шеллы /minsk/tc/store/* не кладём в dist —
// иначе статикой мог бы уехать 200 вместо 301 на malllist.
if (DEPLOYED_SITE_MODE === 'platform' && REDIRECT_MALLS_ENABLED) {
  console.log('[tc-store-seo-shells] redirects.malls — пропускаю (шеллы только на malllist)');
  process.exit(0);
}

const DIST_DIR = 'dist';
const SITE_ORIGIN = catalogOrigin('tc');
const DESCRIPTION_BUDGET = 160;
const TC_HUB_SNIPPET_ITEMS = [
  'адреса и форматы',
  'арендаторы',
  'отзывы',
  'площадь и парковка',
  'метро рядом',
];

const escapeAttr = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function pluralCenters(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'торговый центр';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'торговых центра';
  return 'торговых центров';
}

function subjectGen(n, label) {
  const head = n % 10 === 1 && n % 100 !== 11 ? 'торгового центра' : 'торговых центров';
  return `${head} Минска с ${label}`;
}

function capitalizeFirst(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Близнец businessCenterHubDescription(..., 'tc') в src/lib/pageMeta.ts. */
function hubDescription(subject, count) {
  const head = `Актуальная аналитика ${count} ${subject}. Обновляется ежемесячно.`;
  const shown = [...TC_HUB_SNIPPET_ITEMS];
  const assemble = () => `${head} ${capitalizeFirst(shown.join(', '))}.`;
  while (shown.length > 1 && assemble().length > DESCRIPTION_BUDGET) shown.pop();
  return assemble();
}

/**
 * Упрощённый подбор заголовка под SERP: без таблицы ширин Arial (она в
 * serpTitleWidth.ts) — варианты от полного к короткому, отсев по длине
 * строки. Клиентский JS потом поставит точный title через fitsSerpTitle.
 */
function pickTitle(baseTitle, count) {
  const year = new Date().getFullYear();
  const word = pluralCenters(count);
  const candidates = [
    `${baseTitle} — ${count} ${word}, обзор ${year}`,
    `${baseTitle} — ${count} ${word}`,
    baseTitle,
  ];
  return candidates.find((t) => t.length <= 70) ?? baseTitle;
}

function buildShell(template, { slug, label, count }) {
  const baseTitle = `Торговые центры Минска с ${label}`;
  const title = pickTitle(baseTitle, count);
  const description = hubDescription(subjectGen(count, label), count);
  const path = `minsk/tc/store/${slug}`;
  const url = `${SITE_ORIGIN}/${path}`;
  const h1 = escapeHtml(baseTitle);

  return (
    template
      .replace(/<title>.*?<\/title>/, `<title>${escapeAttr(title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeAttr(description)}$2`)
      .replace(/(<meta property="og:type" content=")[^"]*(")/, '$1article$2')
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(title)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeAttr(description)}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapeAttr(url)}$2`)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeAttr(title)}$2`)
      .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeAttr(description)}$2`)
      .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${escapeAttr(url)}$2`)
      .replace(/(<meta name="robots" content=")[^"]*(")/, '$1noindex, follow$2')
      // RealEstateListing из index.html — про Red One, на подборке магазина не нужен.
      .replace(
        /(<script type="application\/ld\+json" id="object-json-ld">)[\s\S]*?(<\/script>)/,
        '$1$2',
      )
      // <h1> в #root — сигнал ботам без JS; React сносит содержимое при монтировании.
      // Корень может быть уже заполнен (prepare-malls-shell) — заменяем целиком.
      .replace(/<div id="root">[\s\S]*?<\/div>/, `<div id="root"><h1>${h1}</h1></div>`)
  );
}

const listPath = join(DIST_DIR, 'data', 'trade-centers.json');
const filtersPath = join(DIST_DIR, 'data', 'tc-filters.json');
const indexPath = join(DIST_DIR, 'index.html');

if (!existsSync(indexPath)) {
  throw new Error('[tc-store-seo-shells] нет dist/index.html — запускать после vite build');
}
if (!existsSync(listPath) || !existsSync(filtersPath)) {
  console.warn(
    '[tc-store-seo-shells] нет dist/data/trade-centers.json или tc-filters.json — шеллы магазинов не собраны',
  );
  process.exit(0);
}

const { rows } = JSON.parse(readFileSync(listPath, 'utf8'));
const tcFilters = JSON.parse(readFileSync(filtersPath, 'utf8')).rows ?? null;
const hubs = collectTcStoreHubs(Array.isArray(rows) ? rows : [], tcFilters);
const template = readFileSync(indexPath, 'utf8');

for (const hub of hubs) {
  const dir = join(DIST_DIR, 'minsk', 'tc', 'store', hub.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), buildShell(template, hub));
}

console.log(`[tc-store-seo-shells] готово: ${hubs.length} подборок магазинов со своими title/description/h1`);
