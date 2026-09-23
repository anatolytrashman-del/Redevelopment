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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
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
    `business_centers?select=${columns}&kind=eq.bc&order=sort_order.asc`,
    'business_centers (список для каталога)',
  );
  mkdirSync(DIST_DATA, { recursive: true });
  const listPath = join(DIST_DATA, 'business-centers.json');
  const listJson = JSON.stringify({ generatedAt, rows });
  writeFileSync(listPath, listJson);

  // Каталог торговых центров (/minsk/tc, 2026-09-23) — та же таблица с
  // kind = 'tc' и свой файл списка. Файлы отдельных зданий у обоих каталогов
  // общие (dist/data/bc/<slug>.json): слаг уникален на всю таблицу, а чужой
  // каталог карточка отсекает по kind (fetchBusinessCenter).
  const tcRows = await supabaseSelect(
    `business_centers?select=${columns}&kind=eq.tc&order=sort_order.asc`,
    'business_centers (список торговых центров)',
  );
  writeFileSync(join(DIST_DATA, 'trade-centers.json'), JSON.stringify({ generatedAt, rows: tcRows }));

  // Полные ряды по одному файлу на здание — их читает карточка БЦ, которой
  // нужны колонки, выброшенные из списка (технические параметры,
  // арендаторы, СМИ). Имя файла = слаг, поэтому инлайн-скрипту не нужно
  // знать, где карточка, а где раздел: у раздела такого файла просто нет.
  const full = await supabaseSelect('business_centers?select=*&order=sort_order.asc', 'business_centers (полные ряды БЦ и ТЦ)');
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
    `[catalog-data] список: ${rows.length} зданий, ${Math.round(Buffer.byteLength(listJson) / 1024)} КБ; ТЦ: ${tcRows.length}; карточки: ${written} файлов`,
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

// --- Догружаемые данные раздела (2026-09-23) -------------------------------
//
// Всё, что страницы раздела раньше запрашивали из браузера у Supabase помимо
// самих зданий: ставки рынка, размеры лотов, срезы объявлений, отраслевой
// срез арендаторов, внешние метрики, источники — и по каждому зданию
// объявления, отзывы, окружение, 2ГИС, арендаторы. Владелец: «на эти дни
// схема без привлечения Supabase, сама инфа про БЦ меня устраивает» — и
// даже когда база вернётся, отдавать это с CDN дешевле и быстрее, чем
// каждым посетителем ходить в базу (трафик базы и закрыл проект 23.09).
//
// Источник — REST, как у остальной сборки; не отвечает — снимок
// scripts/catalog-data-fallback.json.gz (снимается под ролью anon через
// Management API, см. scripts/snapshot-catalog-data-fallback.mjs).
//
// Файлы:
//   /data/bc-market.json      — ставки рынка, внешние метрики, размеры лотов;
//   /data/bc-analytics.json   — срезы объявлений и отраслевой срез (аналитика);
//   /data/bc-sources.json     — строки для попапа «Источники»;
//   /data/bc/<slug>.extra.json — догружаемые блоки карточки.
// .extra отдельно от /data/bc/<slug>.json НАРОЧНО: основной файл карточки
// ждёт main.tsx перед монтированием, а отзывы с окружением — это ещё
// ~40 КБ на здание, которым в критическом пути делать нечего.
const CATALOG_FALLBACK = resolve(process.cwd(), 'scripts/catalog-data-fallback.json.gz');
let catalogFallback;
function fallbackDataset(name) {
  if (catalogFallback === undefined) {
    try {
      catalogFallback = JSON.parse(gunzipSync(readFileSync(CATALOG_FALLBACK)).toString('utf8'));
    } catch {
      catalogFallback = null;
    }
  }
  const rows = catalogFallback?.datasets?.[name];
  if (!Array.isArray(rows)) return null;
  console.warn(`[catalog-data] ${name}: Supabase недоступен — взят из снимка от ${catalogFallback.generatedAt}`);
  return rows;
}

// PostgREST отдаёт не больше 1000 строк за раз (max_rows проекта) — всё,
// где строк может быть больше, тянется постранично, иначе хвост теряется
// молча (см. CLAUDE.md про .range()).
async function selectAll(query, what) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await supabaseSelect(`${query}&offset=${offset}&limit=1000`, what);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function dataset(name, load) {
  try {
    return await load();
  } catch (err) {
    const rows = fallbackDataset(name);
    if (rows) return rows;
    throw err;
  }
}

async function latestMarketSnapshots() {
  const latest = await supabaseSelect(
    'market_snapshots?select=period&segment=eq.ofisy_bc&order=period.desc&limit=1',
    'market_snapshots (последний период)',
  );
  const period = latest?.[0]?.period;
  if (!period) return [];
  return supabaseSelect(`market_snapshots?select=*&segment=eq.ofisy_bc&period=eq.${period}`, 'market_snapshots');
}

// Колонки 2ГИС и арендаторов — ровно те, что разрешены anon и запрашивает
// сайт (src/lib/businessCenter2gisApi.ts, businessCenterTenantsApi.ts).
const GIS2_COLUMNS =
  'business_center_slug,match_status,rubrics,schedule,reviews,links,attribute_groups,fetched_at,' +
  'tenant_organizations,tenant_organizations_total,tenant_organizations_fetched,tenant_organizations_fetched_at';
const TENANT_COLUMNS = 'business_center_slug,source,source_url,organizations,organization_count,captured_at';
const SLICE_COLUMNS = 'business_center_slug,source,ad_id,deal_type,property_type,size,price_per_sqm';

async function writeExtras() {
  const generatedAt = new Date().toISOString();
  const [market, external, lotSizes, offerSlices, tenantCity, sources, offers, reviews, nearby, gis2, tenants] =
    await Promise.all([
      dataset('market_ofisy_bc', latestMarketSnapshots),
      dataset('external_ofisy_bc', () => supabaseSelect('external_metrics?select=*&segment=eq.ofisy_bc', 'external_metrics')),
      dataset('lot_sizes', () => selectAll('business_center_offers?select=business_center_slug,size&order=id.asc', 'лоты')),
      dataset('offer_slices', () => selectAll(`business_center_offers?select=${SLICE_COLUMNS}&order=id.asc`, 'срезы объявлений')),
      dataset('tenant_city', () =>
        supabaseSelect('business_center_tenant_city_categories?select=categories,org_total,building_total,computed_at', 'отраслевой срез'),
      ),
      dataset('site_sources', () =>
        supabaseSelect('business_centers?select=website,developer_info,media_mentions,building_facts&kind=eq.bc&limit=1000', 'источники'),
      ),
      dataset('offers', () => selectAll('business_center_offers?select=*&order=price_per_sqm.asc,id.asc', 'объявления')),
      dataset('reviews', () => selectAll('business_center_review_snapshots?select=*&order=id.asc', 'отзывы')),
      dataset('nearby', () => selectAll('business_center_nearby_places?select=*&order=distance_meters.asc,id.asc', 'окружение')),
      dataset('gis2', () => supabaseSelect(`business_center_2gis_snapshots?select=${GIS2_COLUMNS}`, '2ГИС')),
      dataset('tenants', () =>
        supabaseSelect(`business_center_tenant_source_snapshots?select=${TENANT_COLUMNS}&source=eq.yandex_maps`, 'арендаторы'),
      ),
    ]);

  // Городские срезы (размеры лотов для каталога, срезы для аналитики) — только
  // объявления в бизнес-центрах: в business_center_offers лежат и объявления
  // торговых центров (kind = 'tc'), им в офисных медианах не место. Набор
  // слагов — из уже записанного списка БЦ (там только kind = 'bc'); нет
  // списка — оба ключа не пишем, и страница сама сходит в базу, где
  // businessCenterOffersApi фильтрует тем же правилом.
  const bcListPath = join(DIST_DATA, 'business-centers.json');
  const bcSlugs = existsSync(bcListPath)
    ? new Set(JSON.parse(readFileSync(bcListPath, 'utf8')).rows.map((r) => r.slug))
    : null;
  const onlyBc = (rows) => (bcSlugs ? rows.filter((r) => bcSlugs.has(r.business_center_slug)) : undefined);

  mkdirSync(join(DIST_DATA, 'bc'), { recursive: true });
  // Каталог и хабы берут отсюда ставки рынка и размеры лотов — файл держим
  // лёгким; срезы объявлений и отраслевой срез нужны одной странице
  // аналитики и живут в своём файле, чтобы каталог их не качал.
  writeFileSync(
    join(DIST_DATA, 'bc-market.json'),
    JSON.stringify({ generatedAt, marketSnapshots: { ofisy_bc: market }, externalMetrics: { ofisy_bc: external }, lotSizes: onlyBc(lotSizes) }),
  );
  writeFileSync(join(DIST_DATA, 'bc-analytics.json'), JSON.stringify({ generatedAt, offerSlices: onlyBc(offerSlices), tenantCity }));
  writeFileSync(join(DIST_DATA, 'bc-sources.json'), JSON.stringify({ generatedAt, rows: sources }));

  // Файл .extra пишется КАЖДОМУ зданию из списка, даже пустой: пустой файл
  // — это ответ «у здания нет отзывов», а отсутствие файла браузер понял бы
  // как «не знаю» и пошёл бы в базу.
  // Оба каталога: и бизнес-центры, и торговые центры (trade-centers.json).
  const slugs = ['business-centers.json', 'trade-centers.json'].flatMap((name) => {
    const listPath = join(DIST_DATA, name);
    return existsSync(listPath)
      ? JSON.parse(readFileSync(listPath, 'utf8')).rows.map((r) => r.slug).filter((s) => /^[a-z0-9-]+$/.test(s ?? ''))
      : [];
  });
  const bySlug = (rows) => {
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.business_center_slug)) map.set(row.business_center_slug, []);
      map.get(row.business_center_slug).push(row);
    }
    return map;
  };
  const [offersBy, reviewsBy, nearbyBy, gis2By, tenantsBy] = [offers, reviews, nearby, gis2, tenants].map(bySlug);
  for (const slug of slugs) {
    writeFileSync(
      join(DIST_DATA, 'bc', `${slug}.extra.json`),
      JSON.stringify({
        generatedAt,
        offers: offersBy.get(slug) ?? [],
        reviews: reviewsBy.get(slug) ?? [],
        nearby: nearbyBy.get(slug) ?? [],
        gis2: gis2By.get(slug)?.[0] ?? null,
        tenants: tenantsBy.get(slug)?.[0] ?? null,
      }),
    );
  }
  console.log(`[catalog-data] догружаемые данные: общие наборы + ${slugs.length} файлов .extra`);
}

main(columns)
  .catch(async (err) => {
    console.warn(`[catalog-data] данные каталога не собраны из базы: ${err instanceof Error ? err.message : err}`);
    try {
      await copyFromProd();
    } catch (copyErr) {
      console.warn(`[catalog-data] и с прода скопировать не вышло: ${copyErr instanceof Error ? copyErr.message : copyErr}`);
    }
  })
  // Только после main: списку слагов для .extra нужен готовый список.
  .then(() => writeExtras())
  .catch((err) => {
    // Без догружаемых файлов страницы работают как раньше — через запросы в
    // базу из браузера, — поэтому сборку не валим.
    console.warn(`[catalog-data] догружаемые данные не собраны: ${err instanceof Error ? err.message : err}`);
  });
