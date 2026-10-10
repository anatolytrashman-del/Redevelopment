// Разовый/ручной пинг IndexNow при переезде каталога ТЦ на malllist.pro.
// По рекомендациям Bing/Яндекс IndexNow: отправить НОВЫЕ URL на новом host
// (старые URL с 301 подхватит обход по редиректам + обновлённый sitemap
// платформы без /minsk/tc).
//
// Использование:
//   node scripts/indexnow-malls-migration.mjs
//   node scripts/indexnow-malls-migration.mjs --from-live
//
// --from-live: взять URL из https://malllist.pro/sitemap.xml
// иначе: из dist/sitemap.xml (после PUBLIC_SITE=malls npm run build:app)
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MALLS_ORIGIN } from './domainSplit.mjs';

const INDEXNOW_KEY = '8749bf38ccefd4070d1d1cbb901a168f';
const HOST = 'malllist.pro';
const SITE = MALLS_ORIGIN;
const fromLive = process.argv.includes('--from-live');

async function loadUrls() {
  if (fromLive) {
    const res = await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`malllist sitemap ${res.status}`);
    const xml = await res.text();
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  }
  const path = resolve(process.cwd(), 'dist/sitemap.xml');
  if (!existsSync(path)) {
    throw new Error('нет dist/sitemap.xml — соберите с PUBLIC_SITE=malls или передайте --from-live');
  }
  const xml = readFileSync(path, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function main() {
  const urlList = (await loadUrls()).filter((u) => u.startsWith(SITE));
  if (urlList.length === 0) throw new Error('список URL пуст');
  console.log(`[indexnow-malls] ${urlList.length} URL → ${HOST}`);

  // IndexNow принимает до 10k URL за запрос; у нас ~200 — один batch.
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
  console.log(`[indexnow-malls] статус ${res.status}: ${body.slice(0, 300)}`);
  if (!res.ok && res.status !== 202) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
