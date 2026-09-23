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

// Ключи полного ряда, которые в файл здания не пишем. Сырой текст сайта БЦ
// (official_site_snapshot_text и соседи) читает только парсер в админке:
// BusinessCenterRow этих полей не знает, fromRow их не смотрит, а весили они
// 1,4 МБ из 3,2 МБ всех файлов карточек (замер 2026-09-22) — то есть почти
// половину того, что main.tsx ждёт перед монтированием карточки.
const DETAIL_SKIP_KEY = /^official_site_snapshot_/;

async function main(columns) {
  const generatedAt = new Date().toISOString();

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
    const slim = Object.fromEntries(Object.entries(row).filter(([key]) => !DETAIL_SKIP_KEY.test(key)));
    writeFileSync(join(bcDir, `${row.slug}.json`), JSON.stringify({ generatedAt, row: slim }));
    written += 1;
  }

  console.log(
    `[catalog-data] список: ${rows.length} зданий, ${Math.round(Buffer.byteLength(listJson) / 1024)} КБ; карточки: ${written} файлов`,
  );
}

// Разбор LIST_COLUMNS — вне catch ниже, нарочно: это инвариант кода, а не
// сети. Если регулярка перестала находить список (переформатировали файл),
// сборка обязана упасть — иначе файлы данных тихо пропадут, страницы
// вернутся к «Загрузка…» поверх пререндера, и CLS 0,22 приедет на прод без
// единой ошибки в логе.
const columns = listColumns();

// Сетевые сбои сборку не валят. База недоступна (2026-09-23: Supabase
// закрыл проект за трафик, 402 на любой запрос) — берём файлы, которые уже
// лежат на проде: без них страницы раздела после старта JS шли бы в ту же
// закрытую базу (см. fallbackToSnapshot в src/lib/businessCentersApi.ts).
// Данные устаревшие, но настоящие.
const SITE_ORIGIN = 'https://redevelopment.pro';

async function copyFromProd() {
  const get = async (path) => {
    const res = await fetch(`${SITE_ORIGIN}${path}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`прод ответил ${res.status} на ${path}`);
    return res.text();
  };
  const listJson = await get('/data/business-centers.json');
  const { rows } = JSON.parse(listJson);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('на проде пустой /data/business-centers.json');
  mkdirSync(join(DIST_DATA, 'bc'), { recursive: true });
  writeFileSync(join(DIST_DATA, 'business-centers.json'), listJson);
  const slugs = rows.map((r) => r.slug).filter((slug) => typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug));
  let written = 0;
  for (let i = 0; i < slugs.length; i += 8) {
    await Promise.all(
      slugs.slice(i, i + 8).map(async (slug) => {
        try {
          writeFileSync(join(DIST_DATA, 'bc', `${slug}.json`), await get(`/data/bc/${slug}.json`));
          written += 1;
        } catch (err) {
          console.warn(`[catalog-data] /data/bc/${slug}.json не скопирован: ${err instanceof Error ? err.message : err}`);
        }
      }),
    );
  }
  console.warn(`[catalog-data] данные каталога скопированы с прода: список ${rows.length} зданий, карточек ${written}`);
}

main(columns).catch(async (err) => {
  console.warn(`[catalog-data] данные каталога не собраны из базы: ${err instanceof Error ? err.message : err}`);
  try {
    await copyFromProd();
  } catch (copyErr) {
    console.warn(`[catalog-data] и с прода скопировать не вышло: ${copyErr instanceof Error ? copyErr.message : copyErr}`);
  }
});
