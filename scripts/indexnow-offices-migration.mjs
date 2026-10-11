// Разовый/ручной пинг IndexNow при переезде каталога БЦ на officelist.pro.
// Отправляем НОВЫЕ URL на новом host; старые с 301 подхватит обход + sitemap
// платформы без /minsk/bc.
//
// Использование:
//   node scripts/indexnow-offices-migration.mjs
//   node scripts/indexnow-offices-migration.mjs --from-live
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OFFICES_ORIGIN } from './domainSplit.mjs';

const INDEXNOW_KEY = '8749bf38ccefd4070d1d1cbb901a168f';
const HOST = 'officelist.pro';
const SITE = OFFICES_ORIGIN;
const fromLive = process.argv.includes('--from-live');

async function loadUrls() {
  if (fromLive) {
    const res = await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`officelist sitemap ${res.status}`);
    const xml = await res.text();
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  }
  const path = resolve(process.cwd(), 'dist/sitemap.xml');
  if (!existsSync(path)) {
    throw new Error('нет dist/sitemap.xml — соберите с PUBLIC_SITE=offices или передайте --from-live');
  }
  const xml = readFileSync(path, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function main() {
  const urlList = (await loadUrls()).filter((u) => u.startsWith(SITE));
  if (urlList.length === 0) throw new Error('список URL пуст');
  console.log(`[indexnow-offices] ${urlList.length} URL → ${HOST}`);

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
      urlList,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text().catch(() => '');
  console.log(`[indexnow-offices] статус ${res.status}: ${body.slice(0, 300)}`);
  if (!res.ok && res.status !== 202) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
