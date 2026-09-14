#!/usr/bin/env node
// Справочник товарных групп в базе (таблица supply_categories, миграция
// 20260914-supplier-screenshots-and-dictionary.sql). Владелец, 2026-09-14:
// новые группы находятся постоянно, а в коде каждая — коммит и ожидание
// публикации; до неё группа видна чипом, но плитки в каталоге не получает.
// Теперь источник правды — база, файл src/data/supplyCategories.ts остаётся
// сидом и запасным вариантом для фронта.
//
//   node scripts/supply-categories/dictionary.mjs sync
//       залить в базу то, что лежит в коде (имя + подсказка + плитка из
//       supplierCatalog.ts). Идемпотентно: существующие строки обновляются,
//       найденные при верификации (source = 'found') не затираются.
//   node scripts/supply-categories/dictionary.mjs add --name='Шлагбаумы' \
//       --hint='...' --tile='Окна и перегородки' --note='77vorota.ru, скрин'
//       завести новую группу, найденную при верификации живого поставщика.
//   node scripts/supply-categories/dictionary.mjs list [--found]
//       показать справочник (или только найденные при верификации).
import fs from 'node:fs';
import path from 'node:path';
import { lit, parseArgs, query, readDictionary } from './lib.mjs';

const { positional, named } = parseArgs();
const cmd = positional[0];

// Плитки общего каталога: группа → имя плитки, в которую она входит. Разбор
// тот же по духу, что readDictionary — регулярка по файлу, а не импорт TS.
//
// Обязательный `includes:` сразу за именем — это и отличает ПЛИТКУ от ХАБА:
// у хаба следом идут description/categories. Без этого условия регулярка
// цеплялась за имя хаба и первую плитку внутри него, и группы первой плитки
// получали имя хаба («Антиобледенение» → «Электрика, свет и слаботочка»
// вместо «Электромонтажные материалы»).
function readTiles(root = process.cwd()) {
  const src = fs.readFileSync(path.join(root, 'src/data/supplierCatalog.ts'), 'utf8');
  const tiles = new Map();
  for (const m of src.matchAll(/name:\s*'([^']+)',\s*(?:\/\/[^\n]*\n\s*)*includes:\s*\[[\s\S]*?\],\s*(?:\/\/[^\n]*\n\s*)*supplyGroups:\s*\[([^\]]*)\]/g)) {
    const tile = m[1];
    const groups = [...m[2].matchAll(/'([^']+)'/g)].map((g) => g[1]);
    for (const g of groups) if (!tiles.has(g)) tiles.set(g, tile);
  }
  return tiles;
}

async function sync() {
  const dict = readDictionary();
  const tiles = readTiles();
  const rows = dict.map((d, i) => ({ ...d, tile: tiles.get(d.name) ?? '', sort: i }));
  const values = rows
    .map((r) => `(${lit(r.name)}, ${lit(r.hint)}, ${lit(r.tile)}, ${r.sort}, 'seed')`)
    .join(',\n    ');
  // Найденные при верификации (source = 'found') не трогаем: у них своя
  // подсказка и своя заметка, файл про них ничего не знает.
  await query(`
    insert into supply_categories (name, hint, tile, sort, source)
    values
    ${values}
    on conflict (name) do update set
      hint = excluded.hint,
      tile = excluded.tile,
      sort = excluded.sort
    where supply_categories.source = 'seed'
  `);
  const [{ count }] = await query('select count(*)::int as count from supply_categories');
  const noTile = await query("select name from supply_categories where tile = '' order by name");
  console.log(`из файла: ${rows.length}, всего в справочнике: ${count}`);
  if (noTile.length) {
    console.log(`без плитки в каталоге (видны только чипом): ${noTile.length}`);
    for (const r of noTile) console.log(`    ${r.name}`);
  }
}

async function add() {
  const name = String(named.name ?? '').trim();
  if (!name) throw new Error('нужен --name');
  const hint = String(named.hint ?? '').trim();
  const tile = String(named.tile ?? '').trim();
  const note = String(named.note ?? '').trim();
  const [{ max }] = await query('select coalesce(max(sort), 0) as max from supply_categories');
  await query(`
    insert into supply_categories (name, hint, tile, sort, source, note)
    values (${lit(name)}, ${lit(hint)}, ${lit(tile)}, ${Number(max) + 1}, 'found', ${lit(note)})
    on conflict (name) do update set
      hint = case when excluded.hint <> '' then excluded.hint else supply_categories.hint end,
      tile = case when excluded.tile <> '' then excluded.tile else supply_categories.tile end,
      note = case when excluded.note <> '' then excluded.note else supply_categories.note end
  `);
  console.log(`${name} — заведена${tile ? `, плитка «${tile}»` : ' (без плитки, будет видна только чипом)'}`);
}

async function list() {
  const where = named.found ? "where source = 'found'" : '';
  const rows = await query(`select name, tile, source, note from supply_categories ${where} order by sort, name`);
  for (const r of rows) {
    console.log(`${r.source === 'found' ? '+' : ' '} ${r.name}${r.tile ? `  → ${r.tile}` : '  → (без плитки)'}${r.note ? `  [${r.note}]` : ''}`);
  }
  console.log(`\nвсего: ${rows.length}`);
}

const commands = { sync, add, list };
if (!commands[cmd]) {
  console.error('команды: sync | add --name=… [--hint=…] [--tile=…] [--note=…] | list [--found]');
  process.exit(1);
}
await commands[cmd]();
