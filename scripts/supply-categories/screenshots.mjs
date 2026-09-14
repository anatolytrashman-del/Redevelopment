#!/usr/bin/env node
// Разбор скриншотов каталога, загруженных владельцем/Светланой в админке
// (вкладка Закупки → Верификация, зона загрузки на карточке; таблица
// supplier_screenshots, бакет supplier-screenshots).
//
// Владелец, 2026-09-14: «у поставщика дофигища категорий и на каждую нужен
// скрин; грузить их в чат — забивать контекст». Поэтому картинки в чат не
// попадают вовсе: их читает СУБАГЕНТ (свой контекст), а в основную сессию
// возвращается только текст дерева разделов.
//
//   node scripts/supply-categories/screenshots.mjs list
//       что накопилось: хосты и число неразобранных скринов
//   node scripts/supply-categories/screenshots.mjs pull [--host=…] [--limit=5]
//       скачать неразобранные в out/screens/<хост>/ и напечатать пути —
//       их отдать субагенту: «прочитай эти картинки, выпиши разделы
//       каталога текстом с отступами в два пробела, ничего не додумывай»
//   node scripts/supply-categories/screenshots.mjs done --host=… --file=…
//       записать расшифровку (она же уходит в review.mjs sections) и
//       пометить скрины хоста разобранными
//
// Дальше — обычный конвейер: review.mjs sections → next → diff → apply.
// Скрин сам по себе категорий НЕ присваивает, только разделы: категории
// по-прежнему проходят проверку уликами.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { lit, parseArgs, query } from './lib.mjs';

const { positional, named } = parseArgs();
const cmd = positional[0];
const outDir = named.out ?? path.join(process.cwd(), 'scripts/supply-categories/out');

async function list() {
  const rows = await query(`
    select s.host,
           count(*) filter (where s.status = 'pending')::int as pending,
           count(*)::int as total,
           max(s.uploaded_at) as last_upload,
           coalesce(snap.categories_verified, false) as verified
    from supplier_screenshots s
    left join supplier_site_snapshots snap on snap.host = s.host
    group by s.host, snap.categories_verified
    having count(*) filter (where s.status = 'pending') > 0
    order by max(s.uploaded_at)
  `);
  if (!rows.length) {
    console.log('неразобранных скринов нет');
    return;
  }
  for (const r of rows) {
    console.log(`${r.host} — ${r.pending} ждут разбора (всего ${r.total}, последняя загрузка ${String(r.last_upload).slice(0, 16)})`);
  }
  console.log(`\nхостов: ${rows.length}`);
}

async function pull() {
  const limitHosts = Number(named.limit ?? 5);
  const explicitHost = typeof named.host === 'string' ? named.host.trim().toLowerCase() : '';
  const where = explicitHost ? `and host = ${lit(explicitHost)}` : '';
  const rows = await query(`
    select id, host, storage_path, public_url
    from supplier_screenshots
    where status = 'pending' ${where}
    order by host, uploaded_at
  `);
  if (!rows.length) {
    console.log('неразобранных скринов нет');
    return;
  }
  const byHost = new Map();
  for (const r of rows) {
    if (!byHost.has(r.host)) byHost.set(r.host, []);
    byHost.get(r.host).push(r);
  }
  const hosts = [...byHost.keys()].slice(0, explicitHost ? undefined : limitHosts);
  for (const host of hosts) {
    const dir = path.join(outDir, 'screens', host);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const items = byHost.get(host);
    console.log(`\n## ${host} — ${items.length} скринов`);
    items.forEach((item, i) => {
      const ext = path.extname(item.storage_path) || '.png';
      const file = path.join(dir, `${String(i + 1).padStart(2, '0')}${ext}`);
      // curl, а не fetch+writeFile: домен *.supabase.co в сессии открыт,
      // бинарник кладём сразу на диск без прогона через память ноды.
      execFileSync('curl', ['-sS', '-f', '-o', file, item.public_url]);
      console.log(`    ${path.relative(process.cwd(), file)}`);
    });
  }
  console.log(`\nОтдать субагенту: «прочитай картинки из каталога(ов) выше, выпиши ТОЛЬКО то,`);
  console.log(`что реально видно в меню/каталоге, деревом с отступами в два пробела; ничего`);
  console.log(`не додумывай и не дополняй по смыслу». Ответ → screenshots.mjs done.`);
}

async function done() {
  const host = String(named.host ?? '').trim().toLowerCase();
  const file = named.file;
  if (!host) throw new Error('нужен --host');
  if (!file || !fs.existsSync(file)) throw new Error('нужен --file с расшифровкой');
  const transcript = fs.readFileSync(file, 'utf8').trim();
  if (!transcript) throw new Error('расшифровка пустая');
  const rows = await query(`
    update supplier_screenshots
    set status = 'done', transcript = ${lit(transcript)}, processed_at = now()
    where host = ${lit(host)} and status = 'pending'
    returning id
  `);
  console.log(`${host}: помечено разобранными ${rows.length}`);
  console.log(`дальше: node scripts/supply-categories/review.mjs sections --host=${host} --file=${file}`);
}

const commands = { list, pull, done };
if (!commands[cmd]) {
  console.error('команды: list | pull [--host=…] [--limit=5] | done --host=… --file=…');
  process.exit(1);
}
await commands[cmd]();
