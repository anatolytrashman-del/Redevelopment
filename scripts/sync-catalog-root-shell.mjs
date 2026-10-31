// После пререндера каталога: кладёт снапшот хаба в dist/index.html.
// Иначе / на officelist/malllist отдаёт голый <h1> из prepare-*-shell
// (без вёрстки) на секунду до React — выглядит как ошибка.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEPLOYED_SITE_MODE, MALLS_ORIGIN, OFFICES_ORIGIN } from './domainSplit.mjs';

if (DEPLOYED_SITE_MODE !== 'offices' && DEPLOYED_SITE_MODE !== 'malls') {
  process.exit(0);
}

const hubRel = DEPLOYED_SITE_MODE === 'offices' ? 'minsk/bc' : 'minsk/tc';
const hubPath = join('dist', hubRel, 'index.html');
const indexPath = join('dist', 'index.html');

if (!existsSync(hubPath)) {
  console.warn(
    `[sync-catalog-root-shell] нет dist/${hubRel}/index.html — корень остаётся шеллом prepare-*`,
  );
  process.exit(0);
}
if (!existsSync(indexPath)) {
  throw new Error('[sync-catalog-root-shell] нет dist/index.html');
}

// Полный снапшот хаба (уже с брендом/canonical/yandex из prerender rewrite).
// 404.html не трогаем — там запасной шелл без каталога.
// Главная — self-canonical на корень домена (а не на /minsk/bc|tc).
const origin = DEPLOYED_SITE_MODE === 'offices' ? OFFICES_ORIGIN : MALLS_ORIGIN;
const rootUrl = `${origin}/`;
const html = readFileSync(hubPath, 'utf8')
  .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${rootUrl}$2`)
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${rootUrl}$2`);
writeFileSync(indexPath, DEPLOYED_SITE_MODE === 'malls' ? withMallsRootMeta(html) : html);
console.log(`[sync-catalog-root-shell] dist/index.html ← dist/${hubRel}/index.html`);

// malllist (владелец, 2026-10-31): у / и /minsk/tc были одинаковые title и
// description. Снапшот берём с /minsk/tc («Торговые центры Минска — каталог
// всех N ТЦ»), а для корня ставим свой title/description — те же строки, что
// считает в браузере BusinessCentersMinskPage (tcRootTitle). Месяц потом
// актуализирует middleware.ts на каждом запросе.
function withMallsRootMeta(source) {
  const m = source.match(/каталог всех (\d+) ТЦ/);
  if (!m) {
    console.warn('[sync-catalog-root-shell] в снапшоте /minsk/tc нет «каталог всех N ТЦ» — meta корня не меняю');
    return source;
  }
  const total = Number(m[1]);
  const months = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Minsk', year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year').value;
  const month = months[Number(parts.find((p) => p.type === 'month').value) - 1];
  const title = `Все ${total} ТЦ Минска — независимый справочник | ${month} ${year}`;
  const n10 = total % 10;
  const n100 = total % 100;
  const word =
    n10 === 1 && n100 !== 11
      ? 'торговый центр'
      : n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)
        ? 'торговых центра'
        : 'торговых центров';
  const description = `Независимый справочник: ${total} ${word} Минска — часы работы, магазины по этажам, где поесть и припарковаться, отзывы посетителей. Не связаны с ТЦ, не берём денег за размещение.`;
  const esc = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const setMeta = (html, attr, key, value) =>
    html.replace(new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`), `$1${esc(value)}$2`);
  let out = source.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  out = setMeta(out, 'name', 'description', description);
  out = setMeta(out, 'property', 'og:title', title);
  out = setMeta(out, 'property', 'og:description', description);
  out = setMeta(out, 'name', 'twitter:title', title);
  out = setMeta(out, 'name', 'twitter:description', description);
  // Article JSON-LD снапшота — тоже от /minsk/tc; headline корня = его title.
  const catalogTitle = `Торговые центры Минска — каталог всех ${total} ТЦ`;
  out = out.split(`"headline":"${catalogTitle}"`).join(`"headline":${JSON.stringify(title)}`);
  console.log(`[sync-catalog-root-shell] title корня: ${title}`);
  return out;
}
