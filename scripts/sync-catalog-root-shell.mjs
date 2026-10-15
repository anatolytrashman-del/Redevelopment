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
writeFileSync(indexPath, html);
console.log(`[sync-catalog-root-shell] dist/index.html ← dist/${hubRel}/index.html`);
