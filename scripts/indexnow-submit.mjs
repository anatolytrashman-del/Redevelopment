// Разовая отправка списка URL в IndexNow (Яндекс, Bing и остальные участники
// протокола) — для случаев, когда автоматическая отправка при сборке
// (notify-indexnow.mjs) не подходит: переезд адресов, отправка в аварийном
// режиме сборки, при котором та пропускает пинг. Запускается воркфлоу
// .github/workflows/indexnow-submit.yml: из песочницы Claude api.indexnow.org
// закрыт прокси, а у раннера GitHub сеть открыта.
//
// Использование: node scripts/indexnow-submit.mjs <файл со списком URL>
// Файл — по URL на строку; пустые строки и строки с «#» пропускаются.
import { readFileSync } from 'node:fs';

const HOST = 'redevelopment.pro';
const SITE = `https://${HOST}`;
const INDEXNOW_KEY = '8749bf38ccefd4070d1d1cbb901a168f'; // тот же ключ, что в notify-indexnow.mjs и public/<ключ>.txt
const BATCH = 10_000; // предел протокола на один запрос

const file = process.argv[2];
if (!file) {
  console.error('Укажите файл со списком URL');
  process.exit(1);
}
const urls = readFileSync(file, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
const foreign = urls.filter((u) => !u.startsWith(`${SITE}/`) && u !== SITE);
if (foreign.length) {
  console.error(`URL не с ${SITE}: ${foreign.slice(0, 3).join(', ')}`);
  process.exit(1);
}

let failed = false;
for (let i = 0; i < urls.length; i += BATCH) {
  const urlList = urls.slice(i, i + BATCH);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text().catch(() => '');
  // 200 — принято, 202 — принято, ключ ещё проверяется участниками.
  console.log(`[indexnow-submit] ${urlList.length} URL → ${res.status} ${body.slice(0, 200)}`);
  if (!res.ok && res.status !== 202) failed = true;
}
process.exit(failed ? 1 : 0);
