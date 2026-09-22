// Данные раздела БЦ прямо в сборку (Ш3-b плана docs/bc-catalog-seo-plan.md).
//
// Зачем. Публичные страницы приходят пререндер-снапшотом, но React их НЕ
// гидратирует: main.tsx сносит снапшот и строит DOM заново (так LCP
// засчитывается по картинке снапшота, см. комментарий там). В первом
// клиентском рендере данных ещё нет — страница схлопывается в «Загрузка…»
// и распухает обратно, когда ответ Supabase доедет. Это и есть CLS 0,221 из
// отчёта PageSpeed: каталог прыгал с 8371 px до 968 px и обратно.
//
// Лечение: те же данные кладём рядом со сборкой статическими файлами,
// инлайн-скрипт в <head> начинает их качать ДО бандла (с того же CDN, а не
// из базы в Европе), а монтирование ждёт их так же, как ждёт отрисовку
// картинки. Когда React строит дерево, данные уже на руках — «Загрузка…» не
// показывается вовсе, прыжка нет.
//
// Свежесть: файл ровесник снапшота (обе сборки одна и та же), то есть до
// часа — ровно то, что и так видит поисковик в разметке страницы.
//
// Список колонок НЕ дублируется: вынимается регуляркой из LIST_COLUMNS в
// src/lib/businessCentersApi.ts, чтобы файл и приложение не разъехались.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
const DIST_DATA = resolve(process.cwd(), 'dist/data');
const API_SOURCE = resolve(process.cwd(), 'src/lib/businessCentersApi.ts');
const ATTEMPTS = 3;

function listColumns() {
  const source = readFileSync(API_SOURCE, 'utf8');
  const block = source.match(/const LIST_COLUMNS = \[([\s\S]*?)\]\.join\(','\);/);
  if (!block) throw new Error('не нашёл LIST_COLUMNS в src/lib/businessCentersApi.ts — правился формат?');
  const columns = [...block[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  if (columns.length < 20) throw new Error(`в LIST_COLUMNS всего ${columns.length} колонок — похоже на сломанный разбор`);
  return columns.join(',');
}

async function supabaseSelect(query, what) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Supabase вернул ${res.status} при запросе ${what}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw lastError;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const columns = listColumns();

  const rows = await supabaseSelect(
    `business_centers?select=${columns}&order=sort_order.asc`,
    'business_centers (список для каталога)',
  );
  mkdirSync(DIST_DATA, { recursive: true });
  const listPath = join(DIST_DATA, 'business-centers.json');
  const listJson = JSON.stringify({ generatedAt, rows });
  writeFileSync(listPath, listJson);

  // Полные ряды по одному файлу на здание — их читает карточка БЦ, которой
  // нужны колонки, выброшенные из списка (технические параметры,
  // арендаторы, СМИ). Имя файла = слаг, поэтому инлайн-скрипту не нужно
  // знать, где карточка, а где раздел: у раздела такого файла просто нет.
  const full = await supabaseSelect('business_centers?select=*&order=sort_order.asc', 'business_centers (полные ряды)');
  const bcDir = join(DIST_DATA, 'bc');
  mkdirSync(bcDir, { recursive: true });
  let written = 0;
  for (const row of full) {
    if (typeof row.slug !== 'string' || !/^[a-z0-9-]+$/.test(row.slug)) continue;
    writeFileSync(join(bcDir, `${row.slug}.json`), JSON.stringify({ generatedAt, row }));
    written += 1;
  }

  console.log(
    `[catalog-data] список: ${rows.length} зданий, ${Math.round(listJson.length / 1024)} КБ; карточки: ${written} файлов`,
  );
}

main().catch((err) => {
  // Не валим сборку: без этих файлов страницы работают как раньше — через
  // запрос в Supabase, только с «Загрузка…» на старте.
  console.warn(`[catalog-data] данные каталога не собраны: ${err instanceof Error ? err.message : err}`);
});
