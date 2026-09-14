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

// Справочник — прямо из TS-файла (регулярка по полям name/hint, без сборки).
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
