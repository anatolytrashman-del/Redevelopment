// Общий REST-доступ к Supabase из serverless-функций закупок + чтение
// ВЕДОМОСТИ поставки. Отдельный файл с "_" в начале — общий хелпер, не
// считается в лимит 12 serverless-функций Vercel Hobby (как
// _invoiceRecognition.js/_invoiceApply.js).
//
// Зачем понадобилось вынести отдельно: позиции ведомости читают теперь двое —
// запись распознанного счёта (_invoiceApply.js, сопоставление строк) и
// маршрутизация КП, загруженного руками (_invoiceRouting.js, «к какой
// поставке это относится»). Держать две копии нельзя: разойдутся — и
// загруженный руками счёт ляжет в другую поставку, чем тот же счёт, пришедший
// письмом.
//
// ГЛАВНОЕ про ведомость (разбор 2026-09-16). Позиции поставки лежат НЕ в
// колонке supplier_research_requests.items — она мертва с 2026-09-11
// (владелец удалил поле «Что просим оценить у поставщиков», см.
// data/supplierResearch.ts), но данные в ней остались. Живая ведомость — это
// материалы РАЗДЕЛА СМЕТЫ, к которому привязана поставка
// (estimates.sections[section_id].materials): именно их показывает «Сравнение
// цен» и по их id ищет свои строки (PurchaseItem.sourceMaterialId ==
// EstimateMaterial.id). Пока сопоставление читало мёртвую колонку, оно
// привязывало строки счетов к id, которых в сравнении не существует: из 136
// сопоставленных строк 105 указывали в пустоту и в таблице не появлялись
// никогда. Порядок источников ниже (сначала смета, потом старая колонка)
// менять только вместе с этим разбором.

function authHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

export async function restGet(path) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`Supabase GET ${path}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

// PostgREST отдаёт максимум 1000 строк (max_rows проекта), причём МОЛЧА: без
// ошибки и без признака обрезки. Так из приложения уже пропадали 141 карточка
// поставщика и 393 снимка сайтов (разбор 2026-09-15). Любая выборка, где
// строк может стать больше тысячи, идёт через эту функцию.
const PAGE_SIZE = 1000;

export async function restGetAll(path) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await restGet(`${path}${sep}limit=${PAGE_SIZE}&offset=${offset}`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function restPatch(path, body) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Supabase PATCH ${path}: ${resp.status} ${await resp.text()}`);
}

export async function restInsert(table, body) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Supabase POST ${table}: ${resp.status} ${await resp.text()}`);
  const rows = await resp.json();
  return rows[0];
}

// Позиции ведомости поставки в том виде, в каком их ждёт suggestMatches
// (_proposalMatches.js). Пустой массив — у поставки ведомости нет вовсе
// (раздел сметы не выбран либо в нём нет материалов): сопоставлять не с чем,
// и это нормальное состояние для «Универсальных поставщиков».
export async function fetchRequestPositions(requestId) {
  if (!requestId) return [];
  const requests = await restGet(
    `supplier_research_requests?id=eq.${requestId}&select=items,estimate_id,section_id`,
  );
  const request = requests[0];
  if (!request) return [];

  const fromEstimate = await materialsOfSection(request.estimate_id, request.section_id);
  if (fromEstimate.length > 0) return fromEstimate;

  // Запасной источник — та самая мёртвая колонка. Оставлен сознательно: у
  // трёх поставок (в том числе «Краски, обои и декоративные покрытия») смета
  // подключена, но пока ведомость в разделе пуста, а позиции в колонке есть.
  // Как только раздел сметы наполнится, источником станет он.
  return normalizePositions(request.items);
}

// То же самое, но сразу для списка поставок: маршрутизация КП спрашивает
// ведомости ВСЕХ поставок разом, и делать это по одной значило бы под полсотни
// запросов в базу на каждый загруженный файл. Смет в проекте единицы, и все их
// разделы приезжают одним запросом.
//
// requests должны быть выбраны с полями items, estimate_id, section_id.
export async function fetchPositionsForRequests(requests) {
  const estimateIds = [...new Set(requests.map((r) => r.estimate_id).filter(Boolean))];
  const estimates = estimateIds.length > 0
    ? await restGet(`estimates?id=in.(${estimateIds.join(',')})&select=id,sections`)
    : [];
  const sectionsById = new Map(estimates.map((e) => [e.id, Array.isArray(e.sections) ? e.sections : []]));
  return new Map(
    requests.map((request) => {
      const section = (sectionsById.get(request.estimate_id) ?? []).find((s) => s && s.id === request.section_id);
      const fromEstimate = normalizePositions(section?.materials);
      return [request.id, fromEstimate.length > 0 ? fromEstimate : normalizePositions(request.items)];
    }),
  );
}

async function materialsOfSection(estimateId, sectionId) {
  if (!estimateId || !sectionId) return [];
  const estimates = await restGet(`estimates?id=eq.${estimateId}&select=sections`);
  const sections = Array.isArray(estimates[0]?.sections) ? estimates[0].sections : [];
  const section = sections.find((s) => s && s.id === sectionId);
  return normalizePositions(section?.materials);
}

function normalizePositions(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim())
    .map((p) => ({
      id: p.id,
      name: p.name,
      quantity: typeof p.quantity === 'number' ? p.quantity : null,
      unit: typeof p.unit === 'string' ? p.unit : '',
      consumption: typeof p.consumption === 'number' ? p.consumption : null,
      consumptionUnit: typeof p.consumptionUnit === 'string' ? p.consumptionUnit : null,
      note: typeof p.note === 'string' ? p.note : '',
    }));
}
