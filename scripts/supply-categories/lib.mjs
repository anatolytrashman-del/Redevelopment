// Общее для скриптов классификации товарных групп: доступ к базе через
// Supabase Management API (тот же SUPABASE_ACCESS_TOKEN, что для
// SQL-миграций из CLAUDE.md), справочник групп из src/data/supplyCategories.ts
// и алиасы, которые модели устойчиво выдумывают вместо справочных названий.
import fs from 'node:fs';
import path from 'node:path';

export const PROJECT_REF = 'iohcdylttyuhwovztrbk';

export function requireToken() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error('SUPABASE_ACCESS_TOKEN не задан');
    process.exit(1);
  }
  return token;
}

export async function query(sql) {
  const token = requireToken();
  const resp = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!resp.ok) throw new Error(`Management API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

export const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Имя, под которым автоматика пишет в activity_log и подписывает письма —
// то же, что AUTO_REPLY_SENDER_NAME в src/data/emailAutoReply.ts (скрипты
// не тянут TS-модули, поэтому копия; менять — синхронно). Владелец,
// 2026-09-14: «все верифицированные сегодня автоматическим образом
// поставщики на странице метрики идут на баланс ИИ-закупщика» — поэтому
// каждая отметка «верифицирован», поставленная роботом (harvest.mjs,
// verify-harvested.mjs, verify-recognized.mjs) или триггером базы
// (verify_supplier_offers_with_captures, миграция
// 20260914-ai-buyer-trigger-verifications-log.sql), логируется как
// supplier_offer_verified от его имени, одна строка на карточку, ровно как
// ручная верификация человека. profile_id пустой — строки в access_profiles
// у ИИ-закупщика нет, и приписывать его действия чьему-то uuid нельзя.
export const AI_BUYER_NAME = 'ИИ-закупщик';

// Хвост для `with up as (update supplier_research_offers … returning id)`:
// вставляет в activity_log по строке на каждую только что отмеченную
// карточку. Обновление и лог — одним запросом, чтобы отметка без записи в
// лог была невозможна (иначе счётчик на /admin/metrics снова разойдётся с
// базой, как разошёлся 2026-09-14 на ~900 карточек).
export const LOG_VERIFIED_SQL = `
  insert into activity_log (profile_id, profile_name, action)
  select null, ${lit(AI_BUYER_NAME)}, 'supplier_offer_verified' from up
  returning id
`;

export function parseArgs(argv = process.argv.slice(2)) {
  const positional = [];
  const named = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      named[k] = v ?? true;
    } else positional.push(a);
  }
  return { positional, named };
}

// Справочник из базы (таблица supply_categories) — источник правды с
// 2026-09-14: группа, заведённая при верификации живого поставщика, должна
// сразу считаться допустимой, без правки файла и ожидания релиза. Файл
// остаётся сидом и запасным вариантом: пустая/недоступная таблица не должна
// останавливать разбор пачки.
export async function readDictionaryLive(root = process.cwd()) {
  try {
    const rows = await query('select name, hint from supply_categories order by sort, name');
    if (rows.length > 0) return rows.map((r) => ({ name: r.name, hint: r.hint ?? '' }));
    console.warn('supply_categories пуста — беру справочник из файла (dictionary.mjs sync его зальёт)');
  } catch (e) {
    console.warn(`справочник из базы не прочитался (${e.message}) — беру из файла`);
  }
  return readDictionary(root);
}

// Запасной путь — прямо из TS-файла (регулярка по полям name/hint, без сборки).
export function readDictionary(root = process.cwd()) {
  const src = fs.readFileSync(path.join(root, 'src/data/supplyCategories.ts'), 'utf8');
  const entries = [...src.matchAll(/name:\s*'([^']+)',\s*hint:\s*'([^']*)'/g)].map((m) => ({ name: m[1], hint: m[2] }));
  if (entries.length === 0) throw new Error('справочник src/data/supplyCategories.ts не прочитался');
  return entries;
}

// Названия, которые классификаторы устойчиво выдумывают вместо справочных.
// Держим здесь, а не расширяем справочник: это те же группы под другим
// именем, а не новые.
export const ALIASES = new Map([
  ['Строительный инструмент', 'Инструмент и оборудование'],
  ['Инструменты', 'Инструмент и оборудование'],
  ['Мебель для ванной', 'Сантехническое оборудование'],
  ['Сантехника', 'Сантехническое оборудование'],
  ['Керамическая плитка', 'Плитка керамическая'],
  ['Лакокрасочные материалы', 'Краски и ЛКМ'],
  ['Краски и лаки', 'Краски и ЛКМ'],
  ['Сухие смеси', 'Сухие строительные смеси'],
  ['Освещение', 'Светильники и освещение'],
  ['Крепёж', 'Крепёж и метизы'],
  ['Крепеж и метизы', 'Крепёж и метизы'],
  ['Метизы и крепеж', 'Крепёж и метизы'],
  ['Метизы и крепёж', 'Крепёж и метизы'],
  ['Подвесные потолки и системы', 'Подвесные потолки'],
  ['Двери', 'Двери межкомнатные'],
]);

export function normalizeCategory(raw) {
  const trimmed = String(raw ?? '').trim();
  return ALIASES.get(trimmed) ?? trimmed;
}

// Хост из адреса сайта — тот же алгоритм, что supplierWebsiteHost на фронте:
// без протокола, без www, без пути.
export const HOST_SQL = (col) =>
  `lower(split_part(regexp_replace(trim(${col}), '^(https?://)?(www\\.)?', ''), '/', 1))`;
