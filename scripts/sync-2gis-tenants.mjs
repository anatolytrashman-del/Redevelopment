// Дособирает организации, которые сидят внутри здания БЦ, из справочника
// 2GIS (Places API, catalog.api.2gis.com/3.0/items?building_id=...) и
// раскладывает их по колонкам tenant_organizations / _total / _fetched /
// _fetched_at таблицы public.business_center_2gis_snapshots. На карточке БЦ
// из этого строится диаграмма отраслей (пункт Б9 плана
// docs/bc-catalog-redesign-plan.md).
//
// Почему именно building_id, а не поиск по адресу: id здания уже лежит в
// снепшоте (gis_building_id, заполнен у всех 143 БЦ) и однозначно
// адресует ЗДАНИЕ, а не организацию в нём — запрос по нему отдаёт ровно
// арендаторов этого дома, без соседей по улице.
//
// Ограничения ключа (проверено вживую 2026-09-16): page_size максимум 10,
// page максимум 5 — то есть за один набор параметров отдаётся не больше 50
// организаций, сколько бы их в здании ни было (у "Титана" их 325). Обойти
// это можно только СУЗИВ запрос — с ключом --deep список у таких зданий
// добирается срезами building_id + rubric_id по 28 "общим рубрикам" 2GIS
// (rubric_id с КОНКРЕТНОЙ рубрикой работает точно, с общей — проверить не
// успели, см. DEEP ниже). Пустое здание отвечает 404 itemNotFound — это не
// ошибка, а "организаций нет" (5 зданий из 143).
//
// Отрасль организации НЕ угадывается по названию: у каждой рубрики 2GIS
// parent_id указывает ровно на одну общую рубрику (проверено на живой
// выдаче — исключений нет), её id и кладём в поле industry. Подписи этих 28
// отраслей — в src/data/tenantIndustries.ts, там же фолбэк на неизвестный id.
//
// Доступ в базу — двумя путями, чтобы скрипт годился и для GitHub Actions
// (workflow_dispatch, SUPABASE_SERVICE_ROLE_KEY), и для разовых прогонов из
// сессии Claude Code, где service-role ключа нет, но есть
// SUPABASE_ACCESS_TOKEN (Management API, см. CLAUDE.md).

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const PROJECT_REF = 'iohcdylttyuhwovztrbk';
const GIS_API_KEY = process.env.GIS_API_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

// Одна организация в здании хранится как {name, gis_id, rubric, industry}:
// имя, id в 2GIS (отличает одноимённые филиалы), название первичной рубрики
// и id общей рубрики. Дополнительные рубрики не храним — на карточке они не
// показываются, а список организаций у крупных зданий читает публичная
// страница, и лишние 2-3 строки на каждую из 300 организаций там не нужны.
// building_id у организации тоже не храним: он одинаковый для всей строки и
// уже лежит в её колонке gis_building_id.
// Ключ 2GIS выдаётся с суточной квотой, и при её превышении отвечает не
// "слишком часто", а 403 apiKeyIsBlocked на ЛЮБОЙ запрос (поймано вживую
// 2026-09-16 после ~1800 запросов за день). Поэтому прогон возобновляемый:
// здания, собранные меньше STALE_DAYS назад, пропускаются, и следующий
// запуск доделывает остаток, а не начинает с начала. Полный пересбор — с
// ключом --all.
const STALE_DAYS = 30;
const REFETCH_ALL = process.argv.includes('--all');
// Добор списка по срезам общим рубрикам (см. ниже) — ПОД ФЛАГОМ и по
// умолчанию выключен: проверить его на живом ключе не успели (ключ
// заблокировался раньше), а один такой прогон добавляет по 28 запросов на
// каждое крупное здание. Обычный прогон берёт по 50 организаций на здание,
// и карточка честно подписывает "50 из 93", а не выдаёт часть за целое.
const DEEP = process.argv.includes('--deep');
const PAGE_SIZE = 10;
const MAX_PAGE = 5; // потолок ключа: page_size * MAX_PAGE = 50 за один набор параметров
const SLICE_THRESHOLD = 50; // больше — добираем по общим рубрикам
const REQUEST_PAUSE_MS = 120;

if (!GIS_API_KEY) {
  console.error('Не задана переменная окружения GIS_API_KEY');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY && !ACCESS_TOKEN) {
  console.error('Нужен SUPABASE_SERVICE_ROLE_KEY или SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

// Клиент supabase-js поднимаем только на service-role пути и только по
// требованию: разовому прогону через Management API зависимости пакета не
// нужны вовсе (в сессии без npm install импорт на верхнем уровне просто
// ронял скрипт на ERR_MODULE_NOT_FOUND).
let supabase = null;
if (SERVICE_ROLE_KEY) {
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

async function runSql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Management API ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// Экранирование строкового литерала для SQL: только для Management-пути,
// где параметризованного запроса нет. Значения — наши же slug'и и JSON,
// но удваиваем кавычки всё равно, иначе одна апостроф-кавычка в названии
// организации ломает весь батч.
function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function loadBuildings() {
  const staleBefore = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  if (supabase) {
    let query = supabase
      .from('business_center_2gis_snapshots')
      .select('business_center_slug,gis_building_id,tenant_organizations_fetched_at')
      .not('gis_building_id', 'is', null)
      .order('business_center_slug');
    if (!REFETCH_ALL) query = query.or(`tenant_organizations_fetched_at.is.null,tenant_organizations_fetched_at.lt.${staleBefore}`);
    const { data, error } = await query;
    if (error) throw error;
    return data.map((row) => ({ slug: row.business_center_slug, buildingId: row.gis_building_id }));
  }
  const freshness = REFETCH_ALL
    ? ''
    : ` and (tenant_organizations_fetched_at is null or tenant_organizations_fetched_at < ${sqlLiteral(staleBefore)}::timestamptz)`;
  const rows = await runSql(
    'select business_center_slug, gis_building_id from business_center_2gis_snapshots ' +
      `where gis_building_id is not null${freshness} order by business_center_slug;`,
  );
  return rows.map((row) => ({ slug: row.business_center_slug, buildingId: row.gis_building_id }));
}

async function saveTenants(slug, organizations, total) {
  if (supabase) {
    const { error } = await supabase
      .from('business_center_2gis_snapshots')
      .update({
        tenant_organizations: organizations,
        tenant_organizations_total: total,
        tenant_organizations_fetched: organizations.length,
        tenant_organizations_fetched_at: new Date().toISOString(),
      })
      .eq('business_center_slug', slug);
    if (error) throw error;
    return;
  }
  await runSql(
    'update business_center_2gis_snapshots set ' +
      `tenant_organizations = ${sqlLiteral(JSON.stringify(organizations))}::jsonb, ` +
      `tenant_organizations_total = ${total}, ` +
      `tenant_organizations_fetched = ${organizations.length}, ` +
      'tenant_organizations_fetched_at = now() ' +
      `where business_center_slug = ${sqlLiteral(slug)};`,
  );
}

async function refreshCityProfile() {
  if (supabase) {
    const { error } = await supabase.rpc('refresh_bc_tenant_city_profile');
    if (error) throw error;
    return;
  }
  await runSql('select public.refresh_bc_tenant_city_profile();');
}

class BlockedKeyError extends Error {}

async function fetchPage({ buildingId, rubricId, page }) {
  const url = new URL('https://catalog.api.2gis.com/3.0/items');
  url.searchParams.set('building_id', buildingId);
  url.searchParams.set('key', GIS_API_KEY);
  url.searchParams.set('fields', 'items.rubrics');
  url.searchParams.set('page_size', String(PAGE_SIZE));
  url.searchParams.set('page', String(page));
  if (rubricId) url.searchParams.set('rubric_id', rubricId);

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      const body = await response.json();
      const code = body?.meta?.code;
      // 404 itemNotFound — легальный ответ "по этим параметрам организаций
      // нет", а не сбой: так отвечают и пустые здания, и большинство срезов
      // по рубрикам.
      if (code === 404) return { total: 0, items: [] };
      // Квота ключа кончилась — дальше все запросы будут такими же, и
      // повторы только сожгут время: останавливаем весь прогон, собранное
      // уже сохранено построчно, следующий запуск продолжит с этого места.
      if (code === 403) throw new BlockedKeyError(body?.meta?.error?.message ?? 'ключ заблокирован');
      if (code !== 200) throw new Error(`2GIS ${code}: ${body?.meta?.error?.message ?? 'без текста'}`);
      return { total: body.result?.total ?? 0, items: body.result?.items ?? [] };
    } catch (error) {
      if (error instanceof BlockedKeyError) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

// Общие рубрики 2GIS — берём из самого API, а не списком в коде: он нужен
// только чтобы нарезать запрос, и если 2GIS однажды добавит рубрику, срез по
// ней появится сам. region_id=32 — Минск.
async function fetchGeneralRubricIds() {
  const url = new URL('https://catalog.api.2gis.com/2.0/catalog/rubric/list');
  url.searchParams.set('key', GIS_API_KEY);
  url.searchParams.set('region_id', '32');
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const body = await response.json();
  if (body?.meta?.code !== 200) throw new Error(`2GIS rubric/list: ${body?.meta?.error?.message ?? body?.meta?.code}`);
  return (body.result?.items ?? [])
    .filter((item) => item?.type === 'general_rubric' && typeof item.id === 'string')
    .map((item) => item.id);
}

function collectItems(items, seen, organizations) {
  for (const item of items) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name) continue;
    const gisId = typeof item?.id === 'string' ? item.id : null;
    const key = gisId ?? name;
    if (seen.has(key)) continue;
    seen.add(key);
    // rubrics[0] у 2GIS — первичная рубрика (kind: primary), она и задаёт
    // отрасль. Организация без рубрик бывает (например, само здание) —
    // такие уходят в "прочее" с industry = null.
    const primary = Array.isArray(item?.rubrics) ? item.rubrics[0] : null;
    organizations.push({
      name,
      gis_id: gisId,
      rubric: typeof primary?.name === 'string' ? primary.name.trim() : null,
      industry: primary?.parent_id ? String(primary.parent_id) : null,
    });
  }
}

async function fetchWithParams(buildingId, rubricId, seen, organizations) {
  let total = 0;
  for (let page = 1; page <= MAX_PAGE; page += 1) {
    const result = await fetchPage({ buildingId, rubricId, page });
    if (page === 1) total = result.total;
    if (result.items.length === 0) break;
    collectItems(result.items, seen, organizations);
    if (page * PAGE_SIZE >= total) break;
    await new Promise((resolve) => setTimeout(resolve, REQUEST_PAUSE_MS));
  }
  return total;
}

async function fetchBuildingTenants(buildingId, generalRubricIds) {
  const seen = new Set();
  const organizations = [];
  const total = await fetchWithParams(buildingId, null, seen, organizations);
  if (DEEP && total > SLICE_THRESHOLD) {
    for (const rubricId of generalRubricIds) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_PAUSE_MS));
      await fetchWithParams(buildingId, rubricId, seen, organizations);
    }
  }
  return { organizations, total: Math.max(total, organizations.length) };
}

async function main() {
  const buildings = await loadBuildings();
  if (buildings.length === 0) {
    console.log('Нечего собирать: все здания собраны меньше 30 дней назад (полный пересбор — с ключом --all)');
    return;
  }
  const generalRubricIds = DEEP ? await fetchGeneralRubricIds() : [];
  console.log(
    `К сбору зданий: ${buildings.length}` + (DEEP ? `, срезов по общим рубрикам: ${generalRubricIds.length}` : ''),
  );

  let savedBuildings = 0;
  let savedOrganizations = 0;
  const failures = [];

  for (const building of buildings) {
    try {
      const { organizations, total } = await fetchBuildingTenants(building.buildingId, generalRubricIds);
      await saveTenants(building.slug, organizations, total);
      savedBuildings += 1;
      savedOrganizations += organizations.length;
      console.log(`${building.slug}: ${organizations.length} из ${total}`);
    } catch (error) {
      failures.push(`${building.slug}: ${error.message}`);
      console.error(`${building.slug}: ОШИБКА ${error.message}`);
      if (error instanceof BlockedKeyError) {
        console.error('Ключ 2GIS заблокирован (суточная квота) — прогон остановлен, повторить завтра тем же запуском');
        break;
      }
    }
  }

  await refreshCityProfile();
  console.log(`Готово: ${savedBuildings} зданий, ${savedOrganizations} организаций, ошибок ${failures.length}`);
  for (const failure of failures) console.error(failure);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
