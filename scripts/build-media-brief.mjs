// Собирает готовое задание для ресёрча публикаций в СМИ («СМИ о здании»,
// см. docs/bc-media-research-brief.md) по всем БЦ одного класса: берёт
// шаблон ТЗ и приклеивает к нему карточки объектов из базы.
//
// Зачем скрипт, а не разовая выборка: классов четыре (A, B+, B, C), и
// «что уже знаем» по каждому объекту надо сокращать ОДИНАКОВО — снимать
// markdown, выбрасывать рейтинги и отзывы (их в прессе не ищут), резать
// длинные тексты. Собери это руками второй раз — получится другой формат,
// и ответы двух прогонов перестанут разбираться одним кодом.
//
// Запуск:
//   node scripts/build-media-brief.mjs A            → docs/bc-media-task-class-a.md
//   node scripts/build-media-brief.mjs B+,B         → один файл на несколько классов сразу
//                                                      (docs/bc-media-task-class-bplus-b.md)
//   node scripts/build-media-brief.mjs B+ --all     → включая БЦ, где подборка уже есть
//
// Читает публичным anon-ключом: business_centers и так открыт на чтение —
// это те же данные, что отдаёт публичная страница каталога.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const PUBLIC_ANON_KEY = 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
const supabase = createClient(SUPABASE_URL, PUBLIC_ANON_KEY);

const BRIEF_PATH = 'docs/bc-media-research-brief.md';
// Маркер в шаблоне, после которого начинается список объектов. Так ТЗ
// остаётся одним файлом, который можно читать и править самостоятельно.
const OBJECTS_MARKER = '<!-- ОБЪЕКТЫ -->';

const classArg = process.argv[2];
const classes = classArg ? classArg.split(',').map((c) => c.trim()).filter(Boolean) : [];
const includeDone = process.argv.includes('--all');
if (classes.length === 0) {
  console.error('Укажи класс: node scripts/build-media-brief.mjs A|B+|B|C[,A,B+,...] [--all]');
  process.exit(1);
}

// Рейтинг и отзывы с карт в прессе не ищут, а в карточке объекта они заняли
// бы половину места и отвлекали исполнителя от того, что он должен искать.
const SKIP_ICONS = new Set(['rating', 'reviews']);
const KNOWN_LIMIT = 260;

function plain(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\s*\n\s*[-–—*]\s*/g, '; ')
    .replace(/\s+/g, ' ')
    // Маркер ПЕРВОГО буллета: предыдущая замена ловит только те, перед
    // которыми есть перевод строки, и без этой строки карточка получает
    // «Арендаторы: - Представительство…» — дефис посреди фразы.
    .replace(/^[-–—*]\s*/, '')
    .trim();
}

function wrap(text, width = 96, indent = '') {
  // Отступ первой строки — часть самого текста ('  - ...'), а split(' ')
  // превратил бы его в пустые слова и потерял.
  const lead = text.match(/^\s*/)[0];
  const words = text.slice(lead.length).split(' ');
  const lines = [];
  let line = lead;
  for (const word of words) {
    if (line.trim() && (line + ' ' + word).length > width) {
      lines.push(line);
      line = indent + word;
    } else {
      line = line.trim() ? `${line} ${word}` : line + word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function card(bc, index) {
  const out = [`### ${index}. ${bc.name}\n`, '```'];
  const add = (label, value) => {
    if (value === null || value === undefined || value === '') return;
    out.push(`${label.padEnd(17)}${value}`);
  };
  add('slug:', bc.slug);
  add('Название:', bc.name);
  if (bc.alt_names?.length) add('Другие названия:', bc.alt_names.join(', '));
  add('Адрес:', bc.address);

  const meta = [];
  if (bc.year_built) meta.push(`сдан ${bc.year_built}`);
  if (bc.floors) meta.push(`${bc.floors} этажей`);
  if (bc.total_area) meta.push(`${bc.total_area} м²`);
  if (bc.status === 'under_construction') meta.push('СТРОИТСЯ');
  if (meta.length) add('Характеристики:', meta.join(', '));

  add('Застройщик:', bc.developer);
  add('Сайт объекта:', bc.website);
  if (bc.description) {
    for (const line of wrap(`Описание:        ${plain(bc.description).slice(0, 400)}`, 96, ' '.repeat(17))) {
      out.push(line);
    }
  }

  const known = (bc.highlights ?? [])
    .filter((h) => !SKIP_ICONS.has(h.icon))
    .map((h) => `${h.label || h.icon}: ${plain(h.text).slice(0, KNOWN_LIMIT)}`)
    .filter((line) => line.split(': ').slice(1).join(': ').length > 0);

  if (known.length) {
    out.push('Что уже знаем:');
    for (const item of known) {
      for (const line of wrap(`  - ${item}`, 96, '    ')) out.push(line);
    }
  } else {
    add('Что уже знаем:', 'ничего сверх характеристик выше');
  }
  out.push('```\n');
  return out.join('\n');
}

const { data, error } = await supabase
  .from('business_centers')
  .select('slug, name, alt_names, address, year_built, total_area, floors, developer, website, status, description, highlights, media_mentions, business_class')
  .in('business_class', classes)
  .order('business_class')
  .order('slug');

if (error) {
  console.error('Не удалось прочитать business_centers:', error.message);
  process.exit(1);
}

const targets = includeDone ? data : data.filter((bc) => (bc.media_mentions ?? []).length === 0);
if (targets.length === 0) {
  console.error(`Класс ${classArg}: подборка уже есть у всех ${data.length} объектов. Нужен повтор — добавь --all.`);
  process.exit(1);
}

const brief = readFileSync(BRIEF_PATH, 'utf8');
if (!brief.includes(OBJECTS_MARKER)) {
  console.error(`В ${BRIEF_PATH} нет маркера ${OBJECTS_MARKER} — шаблон изменился, поправь скрипт.`);
  process.exit(1);
}

const done = data.length - targets.length;
const classLabel = classes.join(', ');
const header = [
  `Объектов в задании: ${targets.length} (класс ${classLabel}` +
    (done ? `, ещё ${done} пропущено — подборка у них уже есть` : '') +
    ').',
  '',
  targets.length > 20
    ? 'Объектов много — это одно задание на несколько своих собственных сессий/заходов,'
      + ' не на один присест. Внутри всё равно бери по 3–4 объекта за раз: на каждый нужно'
      + ' открыть и прочитать десяток страниц, и к концу длинного прогона качество проверки'
      + ' падает раньше, чем кончаются объекты. Не старайся закрыть всё в одном ответе —'
      + ' лучше несколько последовательных проходов с честной проверкой каждой ссылки.'
    : 'Бери по 3–4 объекта за сессию, не все сразу: на каждый нужно открыть и'
      + ' прочитать десяток страниц, и к концу длинного прогона качество проверки'
      + ' падает раньше, чем кончаются объекты.',
  '',
].join('\n');

const out = brief.replace(OBJECTS_MARKER, header + '\n' + targets.map((bc, i) => card(bc, i + 1)).join('\n'));
const slugPart = classes.map((c) => c.toLowerCase().replace('+', 'plus')).join('-');
const file = `docs/bc-media-task-class-${slugPart}.md`;
writeFileSync(file, out);
console.log(`${file}: ${targets.length} объектов класса ${classLabel}`);
