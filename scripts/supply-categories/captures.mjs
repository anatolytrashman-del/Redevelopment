#!/usr/bin/env node
// Разбор меню, снятых закладкой «Снять меню» (tools/menu-bookmarklet) прямо
// со страницы поставщика. Таблица supplier_menu_captures, миграция
// 20260914-supplier-menu-captures.sql.
//
// Отличие от скриншотов: здесь распознавать нечего — дерево уже текстом, в
// том самом формате, который принимает review.mjs sections. Субагент не
// нужен, расход близок к нулю. Но глазами просмотреть НАДО: на первом живом
// снимке (msk.avangardrf.ru, 150 разделов) товарная часть вышла идеальной, а
// в хвосте оказались «Все акции», «Все новости», названия товаров и куски
// рекламных блоков.
//
//   node scripts/supply-categories/captures.mjs list
//       что снято и ждёт разбора
//   node scripts/supply-categories/captures.mjs show --host=…
//       показать дерево целиком (посмотреть глазами перед записью)
//   node scripts/supply-categories/captures.mjs apply --host=… [--drop-after='Услуги']
//       внести разделы в снимок сайта как manual:// и пометить снятое
//       разобранным. --drop-after отрезает хвост, начиная с указанной
//       строки, — ровно для мусора после товарной части.
//   node scripts/supply-categories/captures.mjs skip --host=… --note='…'
//       пометить снятое неподходящим, ничего не записывая.
//
// После apply — обычное продолжение: review.mjs next --hosts=… → diff → apply.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { lit, parseArgs, query } from './lib.mjs';

const { positional, named } = parseArgs();
const cmd = positional[0];

function requireHost() {
  const host = String(named.host ?? '').trim().toLowerCase();
  if (!host) throw new Error('нужен --host');
  return host;
}

async function pendingFor(host) {
  const rows = await query(`
    select id, host, page_url, tree, sections_count, captured_at
    from supplier_menu_captures
    where host = ${lit(host)} and status = 'pending'
    order by captured_at desc
    limit 1
  `);
  if (!rows.length) throw new Error(`у ${host} нет неразобранных снимков меню`);
  return rows[0];
}

async function list() {
  const rows = await query(`
    select c.host,
           count(*)::int as captures,
           max(c.captured_at) as last_at,
           max(c.sections_count) as sections,
           coalesce(max(g.name), c.host) as name
    from supplier_menu_captures c
    left join (
      select lower(split_part(regexp_replace(trim(website_url), '^(https?://)?(www\\.)?', ''), '/', 1)) as host,
             name
      from supplier_research_offers
      where website_url is not null and website_url <> ''
    ) g on g.host = c.host
    where c.status = 'pending'
    group by c.host
    order by max(c.captured_at)
  `);
  if (!rows.length) {
    console.log('неразобранных снимков меню нет');
    return;
  }
  for (const r of rows) {
    console.log(`${r.name} (${r.host}) — ${r.sections} разделов, снято ${String(r.last_at).slice(0, 16)}${r.captures > 1 ? `, снимков: ${r.captures}` : ''}`);
  }
  console.log(`\nхостов: ${rows.length}`);
}

async function show() {
  const row = await pendingFor(requireHost());
  console.log(`# ${row.host} — ${row.sections_count} разделов, ${row.page_url}\n`);
  console.log(row.tree);
}

async function apply() {
  const host = requireHost();
  const row = await pendingFor(host);
  let tree = row.tree;

  // Хвост после товарной части: у Авангарда это «Все акции», «Все новости»,
  // названия отдельных товаров. Отрезаем по строке, с которой начинается
  // мусор, — так проще и честнее, чем угадывать эвристикой.
  const dropAfter = typeof named['drop-after'] === 'string' ? named['drop-after'] : '';
  if (dropAfter) {
    const lines = tree.split('\n');
    const i = lines.findIndex((l) => l.trim() === dropAfter.trim());
    if (i < 0) throw new Error(`строка «${dropAfter}» в дереве не найдена`);
    tree = lines.slice(0, i).join('\n');
    console.log(`отрезано с «${dropAfter}»: осталось ${tree.split('\n').filter(Boolean).length} строк`);
  }

  const file = path.join(os.tmpdir(), `capture-${host}.txt`);
  fs.writeFileSync(file, tree.endsWith('\n') ? tree : `${tree}\n`);
  // Переиспользуем review.mjs sections, а не дублируем запись manual://
  // разделов: формат один, и правила там уже выверены.
  execFileSync('node', ['scripts/supply-categories/review.mjs', 'sections', `--host=${host}`, `--file=${file}`], {
    stdio: 'inherit',
  });
  await query(`
    update supplier_menu_captures
    set status = 'applied', applied_at = now()
    where id = ${lit(row.id)}
  `);
  console.log(`дальше: node scripts/supply-categories/review.mjs next --hosts=${host}`);
}

async function skip() {
  const host = requireHost();
  const row = await pendingFor(host);
  await query(`
    update supplier_menu_captures
    set status = 'skipped', note = ${lit(String(named.note ?? ''))}
    where id = ${lit(row.id)}
  `);
  console.log(`${host}: снимок помечен неподходящим`);
}

// Дерево из снимка → разделы снимка сайта, тем же правилом, что
// review.mjs sections: строка = раздел, отступ в два пробела = вложенность,
// адрес manual:// (не затирается повторным снимком краулера).
function treeToSections(host, tree) {
  const stack = [];
  const added = [];
  tree.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim() || raw.trim().startsWith('#')) return;
    const depth = Math.floor(raw.match(/^ */)[0].length / 2);
    stack.length = depth;
    stack[depth] = `s${i + 1}`;
    added.push({ title: raw.trim(), url: `manual://${host}/${stack.slice(0, depth + 1).join('/')}` });
  });
  return added;
}

// Массовая заливка всего, что снял робот (scripts/harvest.mjs): он проходит
// базу целиком, и разбирать тысячу снимков по одному --host бессмысленно —
// мусорный хвост вроде «Все акции» всё равно отсекается на следующем шаге,
// там у каждой группы обязательная улика. Ручной apply остаётся для случаев,
// когда хвост надо отрезать глазами (--drop-after).
async function applyAll() {
  const limit = Number(named.limit ?? 0);
  const rows = await query(`
    select distinct on (c.host) c.id, c.host, c.tree
    from supplier_menu_captures c
    join supplier_site_snapshots s on s.host = c.host
    where c.status = 'pending'
    order by c.host, c.captured_at desc
    ${limit ? `limit ${limit}` : ''}
  `);
  if (!rows.length) {
    console.log('неразобранных снимков меню нет');
    return;
  }
  const snapshots = await query(`
    select host, sections from supplier_site_snapshots
    where host in (${rows.map((r) => lit(r.host)).join(', ')})
  `);
  const byHost = new Map(snapshots.map((s) => [s.host, Array.isArray(s.sections) ? s.sections : []]));

  let done = 0;
  const CHUNK = 20;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows[i] ? rows.slice(i, i + CHUNK) : [];
    const values = chunk
      .map((r) => {
        const kept = (byHost.get(r.host) ?? []).filter((s) => !(typeof s?.url === 'string' && s.url.startsWith('manual://')));
        const merged = [...kept, ...treeToSections(r.host, r.tree)];
        return `(${lit(r.host)}, ${lit(JSON.stringify(merged))}::jsonb)`;
      })
      .join(',\n      ');
    await query(`
      update supplier_site_snapshots s
      set sections = v.sections
      from (values
      ${values}
      ) as v(host, sections)
      where s.host = v.host
    `);
    await query(`
      update supplier_menu_captures
      set status = 'applied', applied_at = now(), note = 'дерево с сайта записано в снимок'
      where id in (${chunk.map((r) => lit(r.id)).join(', ')})
    `);
    done += chunk.length;
    console.log(`  записано ${done}/${rows.length}`);
  }
  console.log(`готово: разделы с сайта записаны у ${done} хостов`);
  console.log('дальше: node scripts/supply-categories/review.mjs next --limit=20');
}

const commands = { list, show, apply, 'apply-all': applyAll, skip };
if (!commands[cmd]) {
  console.error("команды: list | show --host=… | apply --host=… [--drop-after='строка'] | apply-all [--limit=N] | skip --host=… [--note=…]");
  process.exit(1);
}
await commands[cmd]();
