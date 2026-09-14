#!/usr/bin/env node
// Переосмысление каталога товарных групп. Владелец, 2026-09-14: «я хочу,
// чтобы все категории записывались в базу, а скрипт время от времени
// проходился по всему каталогу и упорядочивал их. Если надо, создавал новые
// категории. Разбивал одну на несколько, или укрупнял, на выбор модели».
//
// Думает не скрипт и не фоновая задача, а модель в диалоге — владелец,
// 2026-09-14: «делать будем не через ProxyApi, а через вызов агента внутри
// диалога тут. Либо ты сделаешь это сам, либо сгенеришь мне файл и я его
// скину сам». Поэтому здесь только два конца: выгрузка досье и приём решения.
//
//   node scripts/supply-categories/catalog.mjs terms
//       пересобрать словарь сырых названий разделов из снятых меню
//   node scripts/supply-categories/catalog.mjs dossier [--min-hosts=1]
//       собрать файл для модели → out/catalog-dossier.md
//   node scripts/supply-categories/catalog.mjs apply --file=decision.json [--dry]
//       применить решение модели: справочник + разметка терминов, затем
//       пересчитать категории ВСЕХ поставщиков по словарю
//   node scripts/supply-categories/catalog.mjs status
//       сколько снято с прошлого прохода и пора ли делать следующий
//
// Почему именно словарь терминов, а не «модель раскладывает каждого
// поставщика»: разложить 1200 сайтов моделью — это 1200 запросов, каждый со
// своей ошибкой, и переделывать всё заново при любом изменении справочника.
// Словарь «термин → группы» делает присвоение обычным поиском: дерево
// разделов → термины → группы. Дёшево, повторяемо, и видно, почему у
// поставщика стоит именно эта группа.
import fs from 'node:fs';
import path from 'node:path';
import { lit, parseArgs, query } from './lib.mjs';

const { positional, named } = parseArgs();
const cmd = positional[0];
const outDir = path.join(process.cwd(), 'scripts/supply-categories/out');

// Ритм проходов задал владелец: первый через 50 новых поставщиков, дальше
// через каждые 100.
const FIRST_REVIEW_AT = 50;
const THEN_EVERY = 100;

// Одно и то же название приходит в разном виде: «Ламинат», «ЛАМИНАТ»,
// «Ламинат  », «Ламинат12» (приклеенный счётчик). Приводим к одному, иначе
// частота размажется по вариантам и ни один не наберёт веса.
function normalizeTerm(raw) {
  return String(raw)
    .replace(/\s+/g, ' ')
    .replace(/^[\s•·—–-]+|[\s•·—–-]+$/g, '')
    .replace(/\s*\(\d+\)$/, '')
    .replace(/\d+$/, '')
    .trim()
    .toLowerCase();
}

function treeTerms(tree) {
  return String(tree || '')
    .split('\n')
    .map((line) => line.replace(/\s*\[[^\]]*\]\s*$/, ''))
    .map((line) => ({ raw: line.trim(), term: normalizeTerm(line) }))
    .filter((t) => t.term.length >= 2 && t.term.length <= 120);
}

async function collectTerms() {
  const rows = await query(`
    select host, tree from supplier_menu_captures where status <> 'skipped'
  `);
  // Частота считается по ДОМЕНАМ, а не по строкам: у одного сайта «Ламинат»
  // может встретиться в меню, в подвале и в хлебных крошках — это всё равно
  // один поставщик.
  const byTerm = new Map();
  for (const row of rows) {
    const seen = new Set();
    for (const { raw, term } of treeTerms(row.tree)) {
      if (seen.has(term)) continue;
      seen.add(term);
      const entry = byTerm.get(term);
      if (entry) entry.hosts += 1;
      else byTerm.set(term, { term, sample: raw, hosts: 1 });
    }
  }
  return [...byTerm.values()].sort((a, b) => b.hosts - a.hosts);
}

async function terms() {
  const list = await collectTerms();
  if (!list.length) {
    console.log('снятых меню нет — сначала прогон робота (npm run harvest)');
    return;
  }
  // Пишем пачками: одним запросом на десять тысяч строк Management API
  // давится, а десятком по тысяче — нет.
  const chunk = 500;
  for (let i = 0; i < list.length; i += chunk) {
    const values = list
      .slice(i, i + chunk)
      .map((t) => `(${lit(t.term)}, ${lit(t.sample)}, ${t.hosts})`)
      .join(', ');
    await query(`
      insert into supply_terms (term, sample, hosts) values ${values}
      on conflict (term) do update
        set hosts = excluded.hosts, sample = excluded.sample, updated_at = now()
    `);
  }
  console.log(`терминов в словаре: ${list.length}`);
  const [row] = await query('select count(*)::int as n from supply_terms where categories = \'{}\' and not ignored');
  console.log(`из них ещё не разобрано: ${row.n}`);
}

async function status() {
  const [row] = await query(`
    select
      (select count(distinct host) from supplier_menu_captures where status <> 'skipped') as снято,
      (select count(*) from supply_terms) as терминов,
      (select count(*) from supply_terms where categories = '{}' and not ignored) as без_группы,
      (select count(*) from supply_catalog_reviews) as проходов,
      (select coalesce(max(suppliers_at_review), 0) from supply_catalog_reviews) as на_прошлом_проходе
  `);
  const since = row.снято - row.на_прошлом_проходе;
  const need = row.проходов === 0 ? FIRST_REVIEW_AT : THEN_EVERY;
  console.log(`снято сайтов: ${row.снято} (с прошлого прохода: ${since})`);
  console.log(`терминов: ${row.терминов}, без группы: ${row.без_группы}`);
  console.log(
    since >= need
      ? `ПОРА: порог ${need} пройден → node scripts/supply-categories/catalog.mjs dossier`
      : `следующий проход через ${need - since} новых сайтов`,
  );
}

// Досье по хостам, которые после прохода остались БЕЗ групп. Такое бывает,
// когда весь словарь сайта — редкие названия: порог частоты их отсекает, и
// поставщик проваливается мимо каталога. Здесь частота не поможет, поможет
// контекст: показываем меню каждого такого сайта целиком, а не строчки
// вперемешку. Владелец, 2026-09-14: «продолжаем переосмысление каталога».
async function dossierEmptyHosts(dict) {
  const rows = await query(`
    select m.host, m.tree
    from supplier_menu_captures m
    left join supplier_site_snapshots s on s.host = m.host
    where m.status <> 'skipped' and coalesce(array_length(s.categories, 1), 0) = 0
    order by m.host
  `);
  const known = await query("select term from supply_terms where categories <> '{}' or ignored");
  const skip = new Set(known.map((r) => r.term));

  const lines = [];
  lines.push('# Каталог: сайты, оставшиеся без товарных групп');
  lines.push('');
  lines.push(
    'Это продолжение первого прохода. Справочник уже собран и менять его',
    'целиком не нужно — задача точечная.',
    '',
    `Ниже ${rows.length} поставщиков, у которых после первого прохода не`,
    'осталось ни одной группы: все названия разделов на их сайтах оказались',
    'редкими и не прошли порог частоты. Названия, уже разложенные или',
    'помеченные мусором в первом проходе, из списков убраны — показано только',
    'то, что осталось нерешённым.',
    '',
    'Разложи эти названия по группам справочника. Правила те же:',
    '',
    '- пустой массив — если это навигация, фильтр (цвет, размер, страна,',
    '  стиль, помещение), услуга продавца, бренд неясного профиля или товар',
    '  не про стройку;',
    '- родовое название («Двери», «Плитка») может идти в две группы;',
    '- точность важнее полноты: по этим группам уходят запросы на закупку.',
    '',
    'Если для целого сайта не нашлось ни одной подходящей группы, а товар',
    'очевидно есть — заведи новую группу в `newCategories`, но только когда',
    'она осмысленна и для других поставщиков тоже.',
  );
  lines.push('');
  lines.push(`## Справочник (${dict.length} групп)`);
  lines.push('');
  for (const c of dict) lines.push(`- ${c.name} | ${c.tile || '—'}${c.hint ? ` | ${c.hint}` : ''}`);
  lines.push('');
  lines.push('## Сайты');
  lines.push('');
  let shown = 0;
  for (const row of rows) {
    const seen = new Set();
    const items = [];
    for (const { raw, term } of treeTerms(row.tree)) {
      if (skip.has(term) || seen.has(term)) continue;
      seen.add(term);
      items.push(raw);
    }
    if (!items.length) continue;
    shown += items.length;
    lines.push(`### ${row.host}`);
    for (const it of items) lines.push(`- ${it}`);
    lines.push('');
  }
  lines.push('## Что вернуть');
  lines.push('');
  lines.push('Один JSON-файл, без пояснений вокруг:');
  lines.push('');
  lines.push('```json');
  lines.push('{');
  lines.push('  "terms": { "реечный потолок": ["Подвесные потолки"], "все новости": [] },');
  lines.push('  "hosts": { "alma-ceramics.ru": ["Керамогранит и плитка"] },');
  lines.push('  "newCategories": [');
  lines.push('    { "name": "Новая группа", "tile": "Плитка каталога", "hint": "что входит" }');
  lines.push('  ],');
  lines.push('  "summary": "два-три предложения о том, что решено"');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push(
    'Ключи `terms` — в нижнем регистре, как названия выше (регистр и лишние',
    'пробелы приводятся автоматически). `newCategories` можно не присылать,',
    'если новых групп не понадобилось. Справочник целиком присылать НЕ надо.',
    '',
    '`hosts` — на случай, когда в меню сайта одни названия коллекций и',
    'моделей («Танзания», «Тиберио»), а чем торгует компания, видно только по',
    'самому сайту. Тогда проставь группы прямо домену: разложить такие',
    'названия по словарю нельзя, а поставщик без групп невидим для закупок.',
    'Пользуйся этим только там, где иначе никак.',
  );
  lines.push('');

  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'catalog-dossier-empty-hosts.md');
  fs.writeFileSync(file, lines.join('\n'));
  console.log(`досье готово: ${path.relative(process.cwd(), file)}`);
  console.log(`сайтов без групп: ${rows.length}, названий на разбор: ${shown}`);
}

async function dossier() {
  const minHosts = Number(named['min-hosts'] ?? 1);
  // Плитка каталога нужна модели, чтобы новая группа сразу попала в нужный
  // раздел общего каталога, — поэтому читаем справочник из базы целиком, а
  // не через readDictionaryLive (там только имя и подсказка).
  const dict = await query('select name, hint, tile from supply_categories order by sort, name');
  if (!dict.length) throw new Error('справочник supply_categories пуст');
  if (named['empty-hosts']) return dossierEmptyHosts(dict);
  const termRows = await query(`
    select term, sample, hosts, categories from supply_terms
    where not ignored and hosts >= ${minHosts}
    order by hosts desc, term
  `);
  const counts = await query(`
    select unnest(categories) as name, count(*)::int as n
    from supplier_site_snapshots where coalesce(array_length(categories, 1), 0) > 0
    group by 1
  `);
  const byName = new Map(counts.map((c) => [c.name, c.n]));

  const mapped = termRows.filter((t) => (t.categories ?? []).length > 0);
  const unmapped = termRows.filter((t) => (t.categories ?? []).length === 0);

  const lines = [];
  lines.push('# Переосмысление каталога товарных групп');
  lines.push('');
  lines.push('## Что это и зачем');
  lines.push('');
  lines.push(
    'Компания ведёт каталог поставщиков стройматериалов и оборудования для',
    'редевелопмента зданий. Каждому поставщику проставлены ТОВАРНЫЕ ГРУППЫ —',
    'по ним ему уходят запросы на закупку. Группы продаются как отдельный',
    'товар, заявленная точность — 97%.',
    '',
    'Названия разделов снимаются прямо с сайтов поставщиков роботом, поэтому',
    'словарь названий растёт и дичает: одно и то же зовут по-разному,',
    'появляются целые сегменты, которых в справочнике нет.',
    '',
    'Твоя задача — привести справочник в порядок целиком, а не подлатать:',
    'завести новые группы, разделить слишком широкие, укрупнить те, что',
    'дробятся зря, и разметить сырые названия по группам.',
  );
  lines.push('');
  lines.push('## Чем плохи крайности');
  lines.push('');
  lines.push(
    '- **Слишком широкая группа** = письмо мимо. Живой случай: группа «Ламинат',
    '  и паркет» — у поставщика ламинат есть, паркета нет, и запрос на паркет',
    '  уходит впустую. Группу разделили. Так же разошлись «гипсокартонные',
    '  листы» и «профили для ГКЛ»: половина поставщиков возит только профиль.',
    '- **Слишком узкая группа** = никто не найдёт и не заполнит. Если раздел',
    '  встречается у одного-двух поставщиков из тысячи, это не группа, а',
    '  частность: пусть попадёт в более широкую.',
    '',
    'Ориентир: группа осмысленна, если по ней реально отправляют отдельный',
    'запрос на закупку и если её можно перепутать с соседней не чаще, чем в',
    'трёх случаях из ста.',
  );
  lines.push('');
  lines.push(`## Текущий справочник (${dict.length} групп)`);
  lines.push('');
  lines.push('Формат: `группа | плитка каталога | у скольких поставщиков стоит`');
  lines.push('');
  for (const c of dict) lines.push(`- ${c.name} | ${c.tile || '—'} | ${byName.get(c.name) ?? 0}${c.hint ? ` | ${c.hint}` : ''}`);
  lines.push('');
  lines.push(`## Названия разделов с сайтов, уже разложенные (${mapped.length})`);
  lines.push('');
  lines.push('Формат: `<у скольких сайтов> | название → группы`. Это можно менять.');
  lines.push('');
  for (const t of mapped) lines.push(`- ${t.hosts} | ${t.sample} → ${t.categories.join(', ')}`);
  lines.push('');
  lines.push(`## Названия разделов, никуда не отнесённые (${unmapped.length})`);
  lines.push('');
  lines.push('Формат: `<у скольких сайтов> | название`. Частота — по доменам.');
  lines.push('');
  for (const t of unmapped) lines.push(`- ${t.hosts} | ${t.sample}`);
  lines.push('');
  lines.push('## Что вернуть');
  lines.push('');
  lines.push('Один JSON-файл, без пояснений вокруг:');
  lines.push('');
  lines.push('```json');
  lines.push('{');
  lines.push('  "categories": [');
  lines.push('    { "name": "Ламинат", "tile": "Напольные покрытия", "hint": "что входит, одной строкой" }');
  lines.push('  ],');
  lines.push('  "terms": {');
  lines.push('    "ламинат": ["Ламинат"],');
  lines.push('    "все акции": []');
  lines.push('  },');
  lines.push('  "changes": [');
  lines.push('    { "type": "split", "from": ["Ламинат и паркет"], "to": ["Ламинат", "Паркетная доска и массив"], "why": "у половины поставщиков только ламинат" }');
  lines.push('  ],');
  lines.push('  "summary": "два-три предложения: что изменилось и почему"');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push(
    'Правила:',
    '',
    '- `categories` — ПОЛНЫЙ итоговый справочник, а не только новое. Чего в',
    '  нём нет, то будет удалено.',
    '- `tile` — плитка общего каталога; бери из текущего справочника или',
    '  заводи новую, если появился целый сегмент.',
    '- `terms` — ключ в нижнем регистре, ровно как в списках выше. Пустой',
    '  массив = не товарный раздел («Доставка», «Вакансии», «Все акции»);',
    '  такие больше не будут показываться в следующих проходах.',
    '- Термин может отображаться в несколько групп, если это правда так.',
    '- Названий сотни: размечай ВСЕ, что перечислены, а не выборочно.',
  );
  lines.push('');

  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'catalog-dossier.md');
  fs.writeFileSync(file, lines.join('\n'));
  console.log(`досье готово: ${path.relative(process.cwd(), file)}`);
  console.log(`групп ${dict.length}, терминов ${termRows.length} (разложено ${mapped.length}, нет ${unmapped.length})`);
}

// Пересчёт категорий у поставщиков по текущему словарю: дерево разделов →
// термины → группы. Отдельной командой нужен после прогона робота — новые
// сайты раскладываются готовым словарём, без модели и без нового досье.
async function recomputeCategories() {
  // 3. Пересчёт категорий у поставщиков — обычный поиск по словарю, без
  // модели: дерево разделов → термины → группы.
  //
  // Пачками по 200 хостов одним UPDATE ... FROM (VALUES …). Первый проход
  // (2026-09-14) шёл по одному запросу на хост — 1069 запросов через
  // Management API, около одиннадцати минут и риск словить таймаут на
  // ровном месте. Здесь то же самое укладывается в несколько секунд.
  const captures = await query(`
    select host, tree from supplier_menu_captures where status <> 'skipped'
  `);
  const mapRows = await query("select term, categories from supply_terms where categories <> '{}'");
  const byTerm = new Map(mapRows.map((r) => [r.term, r.categories]));
  const updates = [];
  for (const row of captures) {
    const found = new Set();
    for (const { term } of treeTerms(row.tree)) {
      for (const name of byTerm.get(term) ?? []) found.add(name);
    }
    if (!found.size) continue;
    updates.push({ host: row.host, categories: [...found] });
  }
  const chunkHosts = 200;
  for (let i = 0; i < updates.length; i += chunkHosts) {
    const values = updates
      .slice(i, i + chunkHosts)
      .map((u) => `(${lit(u.host)}, array[${u.categories.map(lit).join(', ')}]::text[])`)
      .join(', ');
    await query(`
      update supplier_site_snapshots s
      set categories = v.cats, classified_at = now()
      from (values ${values}) as v(host, cats)
      where s.host = v.host
    `);
  }
  const touched = updates.length;
  return touched;
}

async function recompute() {
  const touched = await recomputeCategories();
  console.log(`категории пересчитаны у поставщиков: ${touched}`);
  console.log('дальше: node scripts/verify-recognized.mjs --confirm');
}

async function apply() {
  const file = named.file;
  if (!file) throw new Error('нужен --file=decision.json');
  const decision = JSON.parse(fs.readFileSync(file, 'utf8'));
  const termMap = decision.terms && typeof decision.terms === 'object' ? decision.terms : {};

  // Точечный проход (--terms-only): справочник не пересобирается целиком, а
  // только дополняется новыми группами из newCategories. Нужен для добора
  // хостов, оставшихся без групп: присылать ради десятка названий весь
  // справочник — лишний повод его случайно порезать.
  const termsOnly = Boolean(named['terms-only']) || !Array.isArray(decision.categories);
  const categories = Array.isArray(decision.categories) ? decision.categories : [];
  const added = Array.isArray(decision.newCategories) ? decision.newCategories : [];
  if (!termsOnly && !categories.length) throw new Error('в решении нет categories');

  const names = termsOnly
    ? new Set([
        ...(await query('select name from supply_categories')).map((r) => r.name),
        ...added.map((c) => String(c.name)),
      ])
    : new Set(categories.map((c) => String(c.name)));
  // Ссылка на группу, которой нет в итоговом справочнике, — самая частая
  // ошибка в таком ответе: проверяем ДО записи, иначе поставщики получат
  // группу-призрак.
  const bad = [];
  for (const [term, list] of Object.entries(termMap)) {
    for (const name of list ?? []) if (!names.has(name)) bad.push(`${term} → ${name}`);
  }
  if (bad.length) {
    console.error('термины ссылаются на группы, которых нет в categories:');
    for (const b of bad.slice(0, 20)) console.error('  ' + b);
    process.exit(1);
  }

  if (named.dry) {
    console.log(
      termsOnly
        ? `проверка прошла: новых групп ${added.length}, размечено терминов ${Object.keys(termMap).length}`
        : `проверка прошла: групп ${categories.length}, размечено терминов ${Object.keys(termMap).length}`,
    );
    return;
  }

  // 1. Справочник. В точечном проходе только дописываем новые группы, в
  // полном — пересобираем целиком, и что не названо, то удаляем.
  if (termsOnly) {
    if (added.length) {
      const [{ n: maxSort }] = await query('select coalesce(max(sort), 0) + 1 as n from supply_categories');
      const rows = added
        .map((c, i) => `(${lit(String(c.name))}, ${lit(String(c.hint ?? ''))}, ${lit(String(c.tile ?? ''))}, ${Number(maxSort) + i}, 'catalog-review', ${lit(String(c.note ?? ''))})`)
        .join(', ');
      await query(`
        insert into supply_categories (name, hint, tile, sort, source, note) values ${rows}
        on conflict (name) do update set hint = excluded.hint, tile = excluded.tile, note = excluded.note
      `);
      console.log(`новых групп заведено: ${added.length}`);
    }
  } else {
  const values = categories
    .map((c, i) => `(${lit(String(c.name))}, ${lit(String(c.hint ?? ''))}, ${lit(String(c.tile ?? ''))}, ${i}, 'catalog-review', ${lit(String(c.note ?? ''))})`)
    .join(', ');
  await query(`
    insert into supply_categories (name, hint, tile, sort, source, note) values ${values}
    on conflict (name) do update
      set hint = excluded.hint, tile = excluded.tile, sort = excluded.sort, note = excluded.note
  `);
  await query(`delete from supply_categories where name not in (${[...names].map(lit).join(', ')})`);
  }

  // 2. Разметка терминов.
  const entries = Object.entries(termMap);
  const chunk = 300;
  for (let i = 0; i < entries.length; i += chunk) {
    const part = entries
      .slice(i, i + chunk)
      .map(([term, list]) => {
        const arr = (list ?? []).map((n) => lit(String(n))).join(', ');
        const ignored = (list ?? []).length === 0;
        return `(${lit(term.toLowerCase())}, array[${arr}]::text[], ${ignored})`;
      })
      .join(', ');
    await query(`
      insert into supply_terms (term, categories, ignored) values ${part}
      on conflict (term) do update
        set categories = excluded.categories, ignored = excluded.ignored, updated_at = now()
    `);
  }
  const touched = await recomputeCategories();

  // 4. Прямые группы домену — для сайтов, где в меню одни названия
  // коллекций. Ставятся ПОСЛЕ пересчёта по словарю и объединяются с ним, а
  // не затирают его.
  const hostMap = decision.hosts && typeof decision.hosts === 'object' ? decision.hosts : {};
  const hostEntries = Object.entries(hostMap).filter(([, list]) => Array.isArray(list) && list.length);
  const badHosts = [];
  for (const [host, list] of hostEntries) {
    for (const name of list) if (!names.has(String(name))) badHosts.push(`${host} → ${name}`);
  }
  if (badHosts.length) {
    console.error('домены ссылаются на группы, которых нет в справочнике:');
    for (const b of badHosts.slice(0, 20)) console.error('  ' + b);
    process.exit(1);
  }
  for (let i = 0; i < hostEntries.length; i += chunkHosts) {
    const values = hostEntries
      .slice(i, i + chunkHosts)
      .map(([host, list]) => `(${lit(host.toLowerCase())}, array[${list.map((n) => lit(String(n))).join(', ')}]::text[])`)
      .join(', ');
    await query(`
      update supplier_site_snapshots s
      set categories = (
            select array_agg(distinct x) from unnest(coalesce(s.categories, '{}') || v.cats) as x
          ),
          classified_at = now()
      from (values ${values}) as v(host, cats)
      where s.host = v.host
    `);
  }
  if (hostEntries.length) console.log(`групп проставлено домену напрямую: ${hostEntries.length}`);

  const [{ n: totalCats }] = await query('select count(*)::int as n from supply_categories');
  const [stat] = await query(`
    select
      (select count(distinct host) from supplier_menu_captures where status <> 'skipped') as снято,
      (select count(*) from supply_terms) as терминов,
      (select count(*) from supply_terms where categories <> '{}') as размечено
  `);
  await query(`
    insert into supply_catalog_reviews (model, suppliers_at_review, terms_total, terms_mapped, categories_after, summary)
    values (${lit(String(named.model ?? 'claude-fable-5-1'))}, ${stat.снято}, ${stat.терминов}, ${stat.размечено}, ${totalCats}, ${lit(String(decision.summary ?? ''))})
  `);

  console.log(`справочник: ${totalCats} групп`);
  console.log(`терминов размечено: ${stat.размечено} из ${stat.терминов}`);
  console.log(`категории пересчитаны у поставщиков: ${touched}`);
  if (Array.isArray(decision.changes)) {
    for (const ch of decision.changes) {
      console.log(`  ${ch.type}: ${(ch.from ?? []).join(', ')} → ${(ch.to ?? []).join(', ')} — ${ch.why ?? ''}`);
    }
  }
}

const commands = { terms, dossier, apply, status, recompute };
if (!commands[cmd]) {
  console.error('команды: terms | dossier [--min-hosts=N | --empty-hosts] | apply --file=decision.json [--terms-only] [--dry] | recompute | status');
  process.exit(1);
}
await commands[cmd]();
