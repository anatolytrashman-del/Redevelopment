#!/usr/bin/env node
// Пошаговая переклассификация товарных групп поставщиков пачками с ручной
// проверкой владельца (с 2026-09-14, см. README.md, раздел «Пошаговая
// переклассификация»). Три шага:
//
//   node scripts/supply-categories/review.mjs next [--limit=10] [--hosts=a.ru,b.ru]
//       выгрузить следующую пачку в out/review-batch.json: верифицированные
//       поставщики первыми, в порядке каталога (по названию), только те, у
//       кого снимок сайта готов и categories_verified ещё не стоит. Один
//       поставщик с несколькими доменами (avangardrf.ru + msk.avangardrf.ru)
//       считается за одну компанию — все его домены попадают в пачку вместе.
//   node scripts/supply-categories/review.mjs diff
//       показать «было → стало» по out/review-result.json (и записать
//       out/review-diff.md) — это и есть то, что показывается владельцу.
//   node scripts/supply-categories/review.mjs apply [--dry]
//       проверить результат (названия — из справочника, у каждой группы есть
//       улика — реальный раздел сайта) и записать в базу с
//       categories_verified = true: пачка выходит на вкладку «Верификация».
//   node scripts/supply-categories/review.mjs sections --host=1001krep.ru --file=sections.txt
//       дописать в снимок разделы, переписанные вручную со скриншота каталога
//       (Светлана присылает скрин → модель переписывает текстом → сюда).
//       Файл — по разделу на строку, вложенность — отступом в два пробела.
//       Хранятся в том же sections с url «manual://…», переживают повторный
//       снимок (см. processSnapshot в Edge Function) и дальше считаются
//       уликами наравне с найденными краулером.
//
// Результат классификации — out/review-result.json, массив
//   [{ "host": "avangardrf.ru",
//      "categories": [{ "name": "Подвесные потолки", "evidence": ["Грильято", "Кассетные потолки"] }],
//      "rejected": [{ "name": "Обои и настенные покрытия", "why": "нет ни одного раздела" }],
//      "missing": ["Двери межкомнатные — на сайте есть, в справочнике нет"],
//      "note": "одна строка, чем компания занимается" }]
// evidence — названия разделов (или фрагменты текста главной) ДОСЛОВНО из
// батча; группа без подтверждённой улики в базу не пишется. Именно это
// отсекает выдуманные группы: модель обязана показать, где на сайте она
// это увидела.
import fs from 'node:fs';
import path from 'node:path';
import { HOST_SQL, lit, normalizeCategory, parseArgs, query, readDictionary } from './lib.mjs';

const { positional, named } = parseArgs();
const cmd = positional[0];
const outDir = named.out ?? path.join(process.cwd(), 'scripts/supply-categories/out');
const batchFile = path.join(outDir, 'review-batch.json');
const resultFile = path.join(outDir, 'review-result.json');
const diffFile = path.join(outDir, 'review-diff.md');

function readJson(file) {
  if (!fs.existsSync(file)) {
    console.error(`нет файла ${path.relative(process.cwd(), file)}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Разделы каталога деревом: глубина — по пути URL относительно самого
// короткого пути на сайте. Классификатору нужна вложенность, а не плоский
// список: «Фурнитура» внутри «Межкомнатные двери» — это дверная фурнитура,
// а не мебельная, и не отдельный профиль поставки.
function sectionTree(sections, host) {
  const seen = new Set();
  const rows = [];
  for (const s of Array.isArray(sections) ? sections : []) {
    const title = String(s?.title ?? '').trim();
    let p = String(s?.url ?? '').trim();
    if (p.startsWith('manual://')) {
      // manual://host/a/b → 'manual:/a/b' — глубина считается как у обычного пути
      p = `manual:${p.slice('manual://'.length).replace(/^[^/]*/, '')}`;
    } else {
      try {
        const u = new URL(p);
        p = u.pathname;
      } catch {
        /* относительный путь или мусор — оставляем как есть */
      }
    }
    p = p.replace(/\/+$/, '').replace(/^\/+/, '');
    const key = `${title.toLowerCase()}|${p.toLowerCase()}`;
    if (!title || seen.has(key)) continue;
    seen.add(key);
    rows.push({ title, path: p, depth: p ? p.split('/').length : 0 });
  }
  const minDepth = rows.reduce((m, r) => (r.depth > 0 && r.depth < m ? r.depth : m), Infinity);
  const base = Number.isFinite(minDepth) ? minDepth : 0;
  // Раздел верхнего уровня без единого потомка в снимке — краулер его не
  // раскрыл (1001krep.ru: «Всё для строительства» пришло одним заголовком,
  // а внутри профили для ГКЛ и стройхимия). Помечаем, чтобы классификатор не
  // считал такой раздел пустым, а при проверке было видно, куда смотреть.
  const paths = rows.map((r) => r.path.toLowerCase());
  // Метку ставим только зонтичным по названию разделам — на «плоских»
  // сайтах (все категории на одном уровне) потомков нет ни у кого, и метка
  // на каждой строке ничего не говорит.
  const UMBRELLA_RE = /(вс[её] для|прочее|разное|другое|другие|товары|каталог|категори|продукция|материалы|ассортимент|оборудование)/i;
  return rows.map((r) => {
    const key = r.path.toLowerCase();
    const unexpanded = r.depth > 0 && r.depth <= base + 1 && key && UMBRELLA_RE.test(r.title) && !paths.some((p) => p !== key && p.startsWith(`${key}/`));
    const src = r.path.startsWith('manual:') ? '  [со скриншота]' : r.path ? `  [/${r.path}]` : '';
    return `${'  '.repeat(Math.max(0, r.depth - base))}${r.title}${src}${unexpanded && !r.path.startsWith('manual:') ? '  (подразделы не раскрыты)' : ''}`;
  });
}

async function next() {
  // Владелец, 2026-09-14 (после того как выборка из 5 карточек contact_source
  // 'ai-research-2026-09' нашла 2 ошибки): «сократи очередь новой верификации
  // до 5 поставщиков» — пачки поменьше держат внимание на каждом конкретном
  // кейсе при дообучении. Было 10 (пачка №1).
  const limit = Number(named.limit ?? 5);
  const explicit = typeof named.hosts === 'string' ? named.hosts.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean) : [];
  const where = explicit.length ? `and s.host in (${explicit.map(lit).join(', ')})` : 'and not s.categories_verified';
  // Владелец, 2026-09-14: «белорусских поставщиков убери из очереди пока,
  // ищи только Россию» — хосты без страны (g.countries пуст) не исключаем
  // (тот же принцип, что в SupplierVerificationTab.tsx: молчаливо прятать
  // нельзя), фильтр только по явному "Беларусь".
  const russiaOnly = explicit.length ? '' : "and not ('Беларусь' = any(coalesce(g.countries, '{}')))";
  const rows = await query(`
    with o as (
      select ${HOST_SQL('website_url')} as host, name, country, verified
      from supplier_research_offers
      where website_url is not null and website_url <> ''
    ),
    g as (
      select host,
             array_agg(distinct name) filter (where name <> '') as names,
             array_agg(distinct country) filter (where country is not null and country <> '') as countries,
             bool_or(verified) as verified
      from o group by host
    )
    select s.host, s.website_url, s.page_title, s.meta_description, s.home_text, s.sections,
           s.categories, s.categories_note, s.categories_verified,
           coalesce(g.names, '{}') as names, coalesce(g.countries, '{}') as countries, coalesce(g.verified, false) as verified
    from supplier_site_snapshots s
    -- Владелец, 2026-09-14 (после пачки №2): «я вижу только 2» — у
    -- 1kirpichi.ru и 3tn.ru снимок сайта есть, а строки в
    -- supplier_research_offers на этот хост нет вовсе (карточку когда-то
    -- удалили, снимок остался сиротой) — isReadyForVerification в
    -- SupplierVerificationTab.tsx группирует карточки verification-очереди
    -- ИМЕННО по offers, так что такой хост физически не может там
    -- появиться, сколько его ни классифицируй. INNER JOIN вместо LEFT —
    -- такие сироты больше не съедают место в пачке.
    join g on g.host = s.host
    where s.status = 'done' ${where} ${russiaOnly}
    order by coalesce(g.verified, false) desc, coalesce(g.names[1], s.host) collate "ru-RU-x-icu", s.host
  `);

  // Компания = совпадающее название карточки; все домены одной компании
  // идут в пачку вместе, лимит считается по компаниям.
  const byCompany = new Map();
  for (const r of rows) {
    const key = (r.names[0] ?? r.host).trim().toLowerCase();
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(r);
  }
  const picked = [];
  for (const group of byCompany.values()) {
    if (!explicit.length && picked.length && new Set(picked.map((r) => r._company)).size >= limit) break;
    for (const r of group) {
      r._company = group[0].names[0] ?? group[0].host;
      picked.push(r);
    }
  }

  const items = picked.map((r) => ({
    host: r.host,
    company: r._company,
    names: r.names,
    countries: r.countries,
    verifiedSupplier: r.verified,
    websiteUrl: r.website_url,
    pageTitle: r.page_title ?? '',
    metaDescription: r.meta_description ?? '',
    homeText: String(r.home_text ?? ''),
    currentCategories: r.categories ?? [],
    currentNote: r.categories_note ?? '',
    sections: sectionTree(r.sections, r.host),
  }));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(batchFile, JSON.stringify(items, null, 1));
  const companies = new Set(items.map((i) => i.company)).size;
  console.log(`компаний: ${companies}, доменов: ${items.length} → ${path.relative(process.cwd(), batchFile)}`);
  for (const i of items) console.log(`  ${i.verifiedSupplier ? '✓' : ' '} ${i.company} — ${i.host} (${i.sections.length} разделов, было групп: ${i.currentCategories.length})`);
}

// Проверка результата против батча и справочника. Возвращает по хосту:
// принятые группы, отклонённые (почему), note.
function validate(batch, result, dict) {
  const known = new Map(dict.map((d) => [d.name, d]));
  const byHost = new Map(batch.map((b) => [b.host, b]));
  const out = [];
  for (const item of Array.isArray(result) ? result : []) {
    const host = String(item?.host ?? '').trim().toLowerCase();
    const b = byHost.get(host);
    if (!b) {
      out.push({ host, error: 'хоста нет в review-batch.json' });
      continue;
    }
    const haystack = [
      ...b.sections.map((s) => s.replace(/\s+\[[^\]]*\](\s+\(подразделы не раскрыты\))?$/, '').trim().toLowerCase()),
      b.pageTitle.toLowerCase(),
      b.metaDescription.toLowerCase(),
      b.homeText.toLowerCase(),
    ];
    const accepted = [];
    const dropped = [];
    for (const c of Array.isArray(item.categories) ? item.categories : []) {
      const name = normalizeCategory(typeof c === 'string' ? c : c?.name);
      const evidence = (Array.isArray(c?.evidence) ? c.evidence : []).map((e) => String(e).trim()).filter(Boolean);
      if (!known.has(name)) {
        dropped.push({ name, why: 'нет в справочнике' });
        continue;
      }
      const confirmed = evidence.filter((e) => {
        const needle = e.toLowerCase();
        return haystack.some((h) => h.includes(needle));
      });
      if (confirmed.length === 0) {
        dropped.push({ name, why: evidence.length ? `улики не найдены на сайте: ${evidence.join('; ')}` : 'улика не указана' });
        continue;
      }
      if (!accepted.some((a) => a.name === name)) accepted.push({ name, evidence: confirmed });
    }
    out.push({
      host,
      batch: b,
      accepted,
      dropped,
      rejected: Array.isArray(item.rejected) ? item.rejected : [],
      missing: Array.isArray(item.missing) ? item.missing : [],
      note: String(item.note ?? '').trim().slice(0, 400),
    });
  }
  for (const b of batch) if (!out.some((o) => o.host === b.host)) out.push({ host: b.host, error: 'нет в review-result.json' });
  return out;
}

function renderDiff(checked) {
  const lines = ['# Переклассификация — было → стало', ''];
  for (const c of checked) {
    if (c.error) {
      lines.push(`## ${c.host} — ОШИБКА: ${c.error}`, '');
      continue;
    }
    const before = new Set(c.batch.currentCategories);
    const after = new Set(c.accepted.map((a) => a.name));
    const kept = [...after].filter((x) => before.has(x));
    const added = [...after].filter((x) => !before.has(x));
    const removed = [...before].filter((x) => !after.has(x));
    lines.push(`## ${c.batch.company} — ${c.host}${c.batch.verifiedSupplier ? ' (верифицирован)' : ''}`);
    lines.push(`- **Было (${before.size}):** ${[...before].join(', ') || '—'}`);
    lines.push(`- **Стало (${after.size}):** ${[...after].join(', ') || '—'}`);
    if (removed.length) lines.push(`- **Убрано:** ${removed.join(', ')}`);
    if (added.length) lines.push(`- **Добавлено:** ${added.join(', ')}`);
    if (kept.length && !added.length && !removed.length) lines.push('- Без изменений');
    for (const a of c.accepted) lines.push(`  - ${a.name} ← ${a.evidence.slice(0, 4).join('; ')}`);
    for (const d of c.dropped) lines.push(`  - ✗ НЕ ЗАПИСАНО «${d.name}»: ${d.why}`);
    for (const r of c.rejected) lines.push(`  - отклонено моделью: ${r.name ?? r} — ${r.why ?? ''}`);
    for (const m of c.missing) lines.push(`  - нет в справочнике: ${m}`);
    lines.push(`- ${c.note}`, '');
  }
  return lines.join('\n');
}

async function diff() {
  const checked = validate(readJson(batchFile), readJson(resultFile), readDictionary());
  const md = renderDiff(checked);
  fs.writeFileSync(diffFile, md);
  console.log(md);
}

async function apply() {
  const checked = validate(readJson(batchFile), readJson(resultFile), readDictionary());
  const bad = checked.filter((c) => c.error);
  if (bad.length) {
    for (const b of bad) console.error(`${b.host}: ${b.error}`);
    process.exit(1);
  }
  for (const c of checked) for (const d of c.dropped) console.log(`${c.host}: ✗ «${d.name}» — ${d.why}`);
  const empty = checked.filter((c) => c.accepted.length === 0);
  for (const c of empty) console.log(`${c.host}: групп нет — запишется пустой массив (сайт вне профиля закупок?)`);
  console.log(`доменов к записи: ${checked.length}${named.dry ? ' (dry run)' : ''}`);
  if (named.dry) return;
  const values = checked
    .map((c) => `(${lit(c.host)}, array[${c.accepted.map((a) => lit(a.name)).join(', ')}]::text[], ${lit(c.note)})`)
    .join(',\n');
  const updated = await query(`
    update supplier_site_snapshots s
    set categories = v.categories, categories_note = v.note, classified_at = now(),
        categories_verified = true, categories_verified_at = now()
    from (values ${values}) as v(host, categories, note)
    where s.host = v.host
    returning s.host
  `);
  console.log(`записано: ${Array.isArray(updated) ? updated.length : '?'}, categories_verified = true`);
}

// Ручные разделы со скриншота: строка = раздел, отступ в два пробела =
// вложенность. Слаг для manual://-адреса — транслит не нужен, достаточно
// уникальности: нумеруем по позиции в файле.
async function sections() {
  const host = String(named.host ?? '').trim().toLowerCase();
  const file = String(named.file ?? '');
  if (!host || !file) {
    console.error('нужно --host=… и --file=…');
    process.exit(1);
  }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const stack = [];
  const added = [];
  lines.forEach((raw, i) => {
    if (!raw.trim() || raw.trim().startsWith('#')) return;
    const depth = Math.floor((raw.match(/^ */)[0].length) / 2);
    const title = raw.trim();
    stack.length = depth;
    stack[depth] = `s${i + 1}`;
    added.push({ title, url: `${'manual://'}${host}/${stack.slice(0, depth + 1).join('/')}` });
  });
  const [row] = await query(`select sections from supplier_site_snapshots where host = ${lit(host)}`);
  if (!row) {
    console.error(`снимка для ${host} нет`);
    process.exit(1);
  }
  const existing = (Array.isArray(row.sections) ? row.sections : []).filter(
    (s) => !(typeof s?.url === 'string' && s.url.startsWith('manual://')),
  );
  const merged = [...existing, ...added];
  await query(`update supplier_site_snapshots set sections = ${lit(JSON.stringify(merged))}::jsonb where host = ${lit(host)}`);
  console.log(`${host}: разделов со скриншота ${added.length} (старые ручные заменены), всего в снимке ${merged.length}`);
}

const commands = { next, diff, apply, sections };
if (!commands[cmd]) {
  console.error('использование: review.mjs next|diff|apply|sections (см. шапку файла)');
  process.exit(1);
}
await commands[cmd]();
