// Торговые блоки карточки ТЦ (2026-09-23): разбор jsonb-колонки
// business_centers.retail_info и чистые функции, которыми пользуются и
// видимые блоки (components/businessCenters/TradeCenterRetailBlocks.tsx), и
// FAQ карточки. Одни и те же функции на обе стороны — чтобы FAQ не
// пересказывал блок своими словами и не расходился с ним.
import type {
  RetailAwardEntry,
  RetailAwardResult,
  RetailEventEntry,
  RetailFigureEntry,
  RetailFirstEntry,
  RetailFloorEntry,
  RetailHoursEntry,
  RetailInfo,
  RetailLabeledValue,
  RetailLeisureEntry,
  RetailLeisureKind,
  RetailLoyaltyEntry,
  RetailParking,
  RetailPitch,
  RetailQuoteEntry,
  RetailRankingEntry,
  RetailRuleEntry,
  RetailServiceEntry,
  RetailSource,
  RetailTransportEntry,
  RetailTransportMode,
} from '../data/businessCenters';

const FIRST_KINDS = new Set(['first', 'anchor', 'former_anchor']);
export const AWARD_RESULTS: RetailAwardResult[] = ['winner', 'diploma', 'laureate', 'finalist', 'nominee', 'other'];
const AWARD_RESULT_SET = new Set<string>(AWARD_RESULTS);
const LEISURE_KINDS = new Set(['cinema', 'food', 'kids', 'sport', 'other']);
export const TRANSPORT_MODES: RetailTransportMode[] = [
  'metro',
  'bus',
  'trolleybus',
  'tram',
  'minibus',
  'shuttle',
  'car',
  'walk',
];
const TRANSPORT_MODE_SET = new Set<string>(TRANSPORT_MODES);

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Строка или число как строка: «685» и 685 в jsonb значат одно и то же. */
function text(value: unknown): string | null {
  return str(value) ?? (num(value) != null ? String(value) : null);
}

/** Год числом; «2025» строкой — тоже год, остальное — нет. */
function yearOf(value: unknown): number | null {
  const t = text(value);
  return t && /^\d{4}$/.test(t) ? Number(t) : null;
}

function sourceOf(raw: Record<string, unknown>): RetailSource {
  return { source: str(raw.source), sourceUrl: str(raw.sourceUrl) };
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Массив строк; допускаем и записи-объекты с `text` — ресёрч путает формы. */
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const s = str(item) ?? (record(item) ? str((item as Record<string, unknown>).text) : null);
    return s ? [s] : [];
  });
}

function figures(value: unknown): RetailFigureEntry[] {
  return records(value).flatMap((r) => {
    const label = str(r.label);
    const v = text(r.value);
    return label && v ? [{ label, value: v, date: str(r.date), note: str(r.note), ...sourceOf(r) }] : [];
  });
}

function pitch(value: unknown): RetailPitch | null {
  const r = record(value);
  if (!r) return null;
  const t = str(r.text) ?? '';
  const points = strings(r.points);
  if (!t && !points.length) return null;
  return { text: t, points, contacts: str(r.contacts), ...sourceOf(r) };
}

function parkingOf(value: unknown): RetailParking | null {
  const r = record(value);
  if (!r) return null;
  const summary = str(r.summary) ?? '';
  const items: RetailLabeledValue[] = records(r.items).flatMap((item) => {
    const label = str(item.label);
    const v = text(item.value);
    return label && v ? [{ label, value: v }] : [];
  });
  if (!summary && !items.length) return null;
  return { summary, items, date: str(r.date), ...sourceOf(r) };
}

/**
 * jsonb из базы → RetailInfo. Колонку заполняет скрипт ресёрча, и любой
 * массив в ней может отсутствовать, а запись — быть неполной: такие записи
 * отбрасываются, а не рисуются пустыми строками. Нет ни одной записи — null,
 * страница тогда не рисует ни одного торгового блока (так у всех БЦ).
 */
export function normalizeRetailInfo(raw: unknown): RetailInfo | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;

  const floorsGuide: RetailFloorEntry[] = records(data.floorsGuide).flatMap((r) => {
    const floor = str(r.floor) ?? (num(r.floor) != null ? String(r.floor) : null);
    const text = str(r.text);
    return floor && text ? [{ floor, text, date: str(r.date), ...sourceOf(r) }] : [];
  });
  const firsts: RetailFirstEntry[] = records(data.firsts).flatMap((r) => {
    const name = str(r.name);
    const kind = str(r.kind);
    if (!name || !kind || !FIRST_KINDS.has(kind)) return [];
    return [{ kind: kind as RetailFirstEntry['kind'], name, text: str(r.text) ?? '', date: str(r.date), ...sourceOf(r) }];
  });
  const leisure: RetailLeisureEntry[] = records(data.leisure).flatMap((r) => {
    const name = str(r.name);
    if (!name) return [];
    const kind = str(r.kind);
    return [
      {
        kind: (kind && LEISURE_KINDS.has(kind) ? kind : 'other') as RetailLeisureKind,
        name,
        text: str(r.text) ?? '',
        date: str(r.date),
        ...sourceOf(r),
      },
    ];
  });
  const ranking: RetailRankingEntry[] = records(data.ranking).flatMap((r) => {
    const place = num(r.place);
    const criterion = str(r.criterion);
    if (place == null || place < 1 || !criterion) return [];
    // Место больше длины списка — ошибка ресёрча, «5-й из 3» на странице не рисуем.
    const total = num(r.total);
    if (total != null && total < place) return [];
    return [
      {
        place,
        criterion,
        scope: str(r.scope) ?? '',
        total,
        year: yearOf(r.year),
        headline: str(r.headline),
        value: text(r.value),
        note: str(r.note),
        ...sourceOf(r),
      },
    ];
  });
  // Награда без названия — не награда. Неизвестный результат — 'other'
  // (сама награда от этого не исчезает, бейдж возьмёт resultText).
  // confirmed ложен только при явном false: схема требует поле всегда, а
  // пометка «по данным застройщика» у подтверждённой награды — тоже неправда.
  const awards: RetailAwardEntry[] = records(data.awards).flatMap((r) => {
    const title = str(r.title);
    if (!title) return [];
    const result = str(r.result);
    return [
      {
        title,
        org: str(r.org),
        year: text(r.year),
        category: str(r.category),
        result: (result && AWARD_RESULT_SET.has(result) ? result : 'other') as RetailAwardResult,
        resultText: str(r.resultText),
        subject: str(r.subject),
        recipient: str(r.recipient),
        text: str(r.text),
        confirmed: r.confirmed !== false && r.confirmed !== 'false',
        ...sourceOf(r),
      },
    ];
  });


  const hours: RetailHoursEntry[] = records(data.hours).flatMap((r) => {
    const zone = str(r.zone);
    const value = str(r.value);
    return zone && value ? [{ zone, value, note: str(r.note), ...sourceOf(r) }] : [];
  });
  const hoursNote = str(data.hoursNote);
  const parking = parkingOf(data.parking);
  // Неизвестный вид транспорта отбрасываем, а не подставляем «что-нибудь»:
  // иконка автобуса у строки про электричку — неправда на странице.
  const transport: RetailTransportEntry[] = records(data.transport).flatMap((r) => {
    const mode = str(r.mode);
    const t = str(r.text);
    return mode && t && TRANSPORT_MODE_SET.has(mode)
      ? [{ mode: mode as RetailTransportMode, text: t, ...sourceOf(r) }]
      : [];
  });
  const services: RetailServiceEntry[] = records(data.services).flatMap((r) => {
    const name = str(r.name);
    return name ? [{ name, text: str(r.text), floor: text(r.floor), ...sourceOf(r) }] : [];
  });
  const rules: RetailRuleEntry[] = records(data.rules).flatMap((r) => {
    const t = str(r.text);
    return t ? [{ text: t, ...sourceOf(r) }] : [];
  });
  const loyalty: RetailLoyaltyEntry[] = records(data.loyalty).flatMap((r) => {
    const name = str(r.name);
    return name ? [{ name, text: str(r.text) ?? '', ...sourceOf(r) }] : [];
  });
  const events: RetailEventEntry[] = records(data.events).flatMap((r) => {
    const name = str(r.name);
    return name ? [{ name, text: str(r.text) ?? '', date: str(r.date), ...sourceOf(r) }] : [];
  });
  const audience = figures(data.audience);
  const leasing = pitch(data.leasing);
  const advertising = pitch(data.advertising);
  const numbers = figures(data.numbers);
  const quotes: RetailQuoteEntry[] = records(data.quotes).flatMap((r) => {
    const who = str(r.who);
    const t = str(r.text);
    return who && t ? [{ who, text: t, date: str(r.date), ...sourceOf(r) }] : [];
  });

  const info: RetailInfo = {
    floorsGuide,
    firsts,
    leisure,
    ranking,
    awards,
    hours,
    hoursNote,
    parking,
    transport,
    services,
    rules,
    loyalty,
    events,
    audience,
    leasing,
    advertising,
    numbers,
    quotes,
  };
  const empty = Object.values(info).every((value) => value == null || (Array.isArray(value) && value.length === 0));
  return empty ? null : info;
}

// --- Этажи ---------------------------------------------------------------

/**
 * Первое число строки этажа: "-1" → -1, "−1" → -1, "2–3" → 2, "6" → 6.
 * Минус признаём только перед числом, а не тире между числами: в "2–3"
 * это диапазон, а не минус тройка. Нет числа («цоколь», «мансарда») — null.
 */
export function floorSortKey(floor: string): number | null {
  const match = floor.match(/(^|[^\d])([-−–]?)\s*(\d+)/);
  if (!match) return null;
  const value = Number(match[3]);
  return match[2] ? -value : value;
}

/**
 * Этажи сверху вниз, как их видит человек на поэтажном указателе: самый
 * верхний первым, подземные последними. Строки без номера — в самом конце,
 * в исходном порядке (sort стабилен).
 */
export function sortFloorsTopDown<T extends { floor: string }>(floors: T[]): T[] {
  return [...floors].sort((a, b) => {
    const ka = floorSortKey(a.floor);
    const kb = floorSortKey(b.floor);
    if (ka == null && kb == null) return 0;
    if (ka == null) return 1;
    if (kb == null) return -1;
    return kb - ka;
  });
}

/** Подпись бейджа: "-1" → "−1" (типографский минус), "2-3" → "2–3". */
export function formatFloorBadge(floor: string): string {
  return floor
    .trim()
    .replace(/^[-–]\s*(?=\d)/, '−')
    .replace(/(\d)\s*[-−–—]\s*(\d)/g, '$1–$2');
}

function isFloorRange(floor: string): boolean {
  return /\d\s*[-−–—]\s*\d/.test(floor);
}

/** "1" → "1 этаж", "2–3" → "2–3 этажи", "цоколь" → "цоколь". */
export function formatFloorLabel(floor: string): string {
  const badge = formatFloorBadge(floor);
  if (floorSortKey(floor) == null) return badge;
  return `${badge} ${isFloorRange(floor) ? 'этажи' : 'этаж'}`;
}

// --- Даты ----------------------------------------------------------------

const MONTHS_NOM = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

/**
 * "2019-03-15" / "2019-03" → "март 2019", "2019" → "2019". День не
 * показываем: для «открылся впервые в Беларуси» он ничего не добавляет, а
 * у половины источников его нет. Непонятная строка возвращается как есть —
 * лучше показать то, что записал ресёрч, чем молча потерять дату.
 */
export function formatRetailDate(date: string | null | undefined): string | null {
  const value = date?.trim();
  if (!value) return null;
  const match = value.match(/^(\d{4})(?:-(\d{1,2}))?(?:-\d{1,2})?(?:[T\s].*)?$/);
  if (!match) return value;
  const month = match[2] ? Number(match[2]) : null;
  if (month != null && month >= 1 && month <= 12) return `${MONTHS_NOM[month - 1]} ${match[1]}`;
  return match[1];
}

// --- Награды и рейтинги (2026-09-24) ---------------------------------------
// Отдельный блок «Награды и рейтинги» (TradeCenterAwardsBlock). До этого
// места в рейтингах были жёлтыми плашками в карточке «Что на каком этаже»,
// и владелец справедливо заметил, что это две разные сущности.

function upperFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export const AWARD_RESULT_LABELS: Record<RetailAwardResult, string | null> = {
  winner: 'победитель',
  diploma: 'диплом',
  laureate: 'лауреат',
  finalist: 'финалист',
  nominee: 'номинант',
  other: null,
};

/** Подпись результата: как записал ресёрч («диплом I степени»), иначе по виду. */
export function awardResultLabel(award: RetailAwardEntry): string | null {
  return award.resultText ?? AWARD_RESULT_LABELS[award.result];
}

/**
 * Ярус результата: 0 — награда получена (победитель, диплом, лауреат),
 * 1 — финал, 2 — номинация, 3 — прочее. Диплом I степени и «победитель» —
 * одно и то же по сути, поэтому внутри яруса решает свежесть, а не вид.
 */
export function awardTier(result: RetailAwardResult): number {
  if (result === 'winner' || result === 'diploma' || result === 'laureate') return 0;
  if (result === 'finalist') return 1;
  if (result === 'nominee') return 2;
  return 3;
}

/** Самый поздний год в строке: «2014–2015» → 2015. Нет года — null. */
function latestYear(year: string | null): number | null {
  const years = (year ?? '').match(/\d{4}/g)?.map(Number) ?? [];
  return years.length ? Math.max(...years) : null;
}

/** Победы выше номинаций, внутри яруса — свежие выше, без года — в конце. */
export function sortAwards(awards: RetailAwardEntry[]): RetailAwardEntry[] {
  return [...awards].sort((a, b) => {
    const tier = awardTier(a.result) - awardTier(b.result);
    if (tier) return tier;
    return (latestYear(b.year) ?? -Infinity) - (latestYear(a.year) ?? -Infinity);
  });
}

/** «Лучший торговый центр · Realt.by · 2014». */
export function awardMeta(award: RetailAwardEntry): string | null {
  const parts = [award.category, award.org, award.year].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * «За что: проект до открытия · получатель: бюро SZK/Z». Предмет — после
 * двоеточия как есть: падеж свободного текста ресёрча не угадать («за
 * архитектура»). «Здание» — предмет по умолчанию (наградили сам ТЦ), его не
 * повторяем.
 */
export function awardDetails(award: RetailAwardEntry, separator = ' · '): string | null {
  const subject = award.subject && !/^здание\.?$/i.test(award.subject) ? `За что: ${award.subject}` : null;
  const recipient = award.recipient ? `${subject ? 'получатель' : 'Получатель'}: ${award.recipient}` : null;
  const parts = [subject, recipient].filter(Boolean);
  return parts.length ? parts.join(separator) : null;
}

/** Строка рейтинга, разложенная для вёрстки и FAQ. */
export interface RankingView {
  place: number;
  total: number | null;
  /** Жирная строка: headline записи или критерий с большой буквы. */
  headline: string;
  /** Среди кого — только у старых записей без headline (там он её заменяет). */
  scope: string | null;
  value: string | null;
  year: number | null;
  source: string | null;
  note: string | null;
}

/**
 * Старые записи (до 2026-09-24) не знают headline/value: значение там
 * лежит в скобках в конце критерия — «арендопригодная площадь (52 000 м²)»,
 * иногда с оговоркой через точку с запятой — «площадь (23 600 м²; какая
 * именно — не уточнено)». Разбираем скобку на значение и оговорку, чтобы
 * крупная строка читалась как формулировка, а не как выписка из таблицы.
 */
export function rankingView(entry: RetailRankingEntry): RankingView {
  let criterion = entry.criterion.trim();
  let value = entry.value;
  let extraNote: string | null = null;
  const match = criterion.match(/^(.*?\S)\s*\(([^()]+)\)$/);
  if (match && !entry.headline) {
    criterion = match[1];
    const [head, ...rest] = match[2].split(';');
    if (!value) value = head.trim() || null;
    const tail = rest.join(';').trim();
    extraNote = tail ? upperFirst(tail) : null;
  }
  const note = [entry.note, extraNote].filter(Boolean).join('; ') || null;
  return {
    place: entry.place,
    total: entry.total != null && entry.total >= entry.place ? entry.total : null,
    headline: entry.headline ?? upperFirst(criterion),
    scope: entry.headline ? null : entry.scope.trim() || null,
    value,
    year: entry.year,
    source: entry.source,
    note,
  };
}

/** «68 600 м² · 2025 · Onliner + Colliers». */
export function rankingMeta(view: RankingView): string | null {
  const parts = [view.value, view.year != null ? String(view.year) : null, view.source].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Свежие рейтинги выше (устаревший топ-10 2015 года — в конце), внутри года — высокие места выше. */
export function sortRanking(ranking: RetailRankingEntry[]): RetailRankingEntry[] {
  return [...ranking].sort((a, b) => {
    const year = (b.year ?? -Infinity) - (a.year ?? -Infinity);
    return year || a.place - b.place;
  });
}

/** Заголовок блока и пункт меню — о том, что в нём реально есть. */
export function awardsRankingTitle(hasAwards: boolean, hasRanking: boolean): string {
  if (hasAwards && hasRanking) return 'Награды и рейтинги';
  return hasAwards ? 'Награды' : 'Место в рейтингах';
}

/**
 * Размер блока для модели высот страницы (businessCenterPageLayout) в
 * условных единицах ~60px. Плитки стоят по две в ряд: ряд наград — 3
 * единицы (название, бейдж, мета, текст), ряд рейтингов — 2. Строка награды
 * из highlights (запасной вариант без retail_info.awards) — одна единица.
 * Замер 2026-09-24 на 1280px: 4 награды + 4 рейтинга — 844px.
 */
export function awardsRankingSize(info: RetailInfo | null, legacyAwardLines = 0): number {
  const awards = info?.awards.length ? Math.ceil(info.awards.length / 2) * 3 : legacyAwardLines;
  const ranking = Math.ceil((info?.ranking.length ?? 0) / 2) * 2;
  return awards + ranking;
}

// --- Источники -----------------------------------------------------------

export interface RetailSourceLink {
  label: string;
  url: string | null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Общий список источников карточки без дублей: одна и та же статья,
 * процитированная тремя строками, — одна ссылка. Ключ — адрес, а у записи
 * без адреса — название источника. Подпись — название, иначе домен.
 */
export function collectRetailSources(entries: RetailSource[]): RetailSourceLink[] {
  const seen = new Set<string>();
  const result: RetailSourceLink[] = [];
  for (const entry of entries) {
    const url = entry.sourceUrl && /^https?:\/\//i.test(entry.sourceUrl) ? entry.sourceUrl : null;
    const label = entry.source ?? (url ? hostOf(url) : null);
    if (!label) continue;
    const key = url ? url.replace(/\/+$/, '').toLowerCase() : `name:${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ label, url });
  }
  // Разные статьи одного издания — разные ссылки с одной подписью; чтобы
  // список не читался как «Onliner, Onliner», вторая и дальше нумеруются.
  const counters = new Map<string, number>();
  return result.map((link) => {
    const n = (counters.get(link.label) ?? 0) + 1;
    counters.set(link.label, n);
    return n > 1 ? { ...link, label: `${link.label}\u00a0(${n})` } : link;
  });
}

// --- FAQ -----------------------------------------------------------------
// Ответы собираются только из полей записи — ничего сверх того, что видно
// в блоках выше.

function sentence(text: string): string {
  const t = text.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

function withText(name: string, text: string, date?: string | null): string {
  const when = formatRetailDate(date ?? null);
  const head = `${name}${when ? ` (${when})` : ''}`;
  return text.trim() ? sentence(`${head} — ${text.trim()}`) : sentence(head);
}

export function floorsFaqAnswer(floors: RetailFloorEntry[]): string | null {
  if (!floors.length) return null;
  return sortFloorsTopDown(floors)
    .map((f) => sentence(`${formatFloorLabel(f.floor)}: ${f.text}`))
    .join('\n');
}

export function firstsFaqAnswer(firsts: RetailFirstEntry[]): string | null {
  const list = firsts.filter((f) => f.kind === 'first');
  if (!list.length) return null;
  return list.map((f) => withText(f.name, f.text, f.date)).join('\n');
}

export function anchorsFaqAnswer(firsts: RetailFirstEntry[]): string | null {
  const anchors = firsts.filter((f) => f.kind === 'anchor');
  const former = firsts.filter((f) => f.kind === 'former_anchor');
  if (!anchors.length && !former.length) return null;
  const lines = anchors.map((f) => withText(f.name, f.text));
  if (former.length) lines.push(`Раньше здесь были: ${former.map((f) => f.name).join(', ')}.`);
  return lines.join('\n');
}

export const LEISURE_KIND_LABELS: Record<RetailLeisureKind, string> = {
  cinema: 'Кино',
  food: 'Еда',
  kids: 'Детям',
  sport: 'Спорт',
  other: 'Развлечения',
};

const LEISURE_ORDER: RetailLeisureKind[] = ['cinema', 'food', 'kids', 'sport', 'other'];

export function sortLeisure(leisure: RetailLeisureEntry[]): RetailLeisureEntry[] {
  return [...leisure].sort((a, b) => LEISURE_ORDER.indexOf(a.kind) - LEISURE_ORDER.indexOf(b.kind));
}

/**
 * Вопрос про досуг зависит от того, что есть: спрашивать «есть ли
 * кинотеатр», когда в данных только детская площадка, — обещать ответ,
 * которого нет. `where` — «в торговом центре «…»».
 */
export function leisureFaqQuestion(leisure: RetailLeisureEntry[], where: string): string | null {
  if (!leisure.length) return null;
  const cinema = leisure.some((l) => l.kind === 'cinema');
  const food = leisure.some((l) => l.kind === 'food');
  if (cinema && food) return `Есть ли ${where} кинотеатр и фудкорт?`;
  if (cinema) return `Есть ли ${where} кинотеатр?`;
  if (food) return `Где поесть ${where}?`;
  return `Какие развлечения есть ${where}?`;
}

export function leisureFaqAnswer(leisure: RetailLeisureEntry[]): string | null {
  if (!leisure.length) return null;
  return sortLeisure(leisure)
    .map((l) => `${LEISURE_KIND_LABELS[l.kind]}: ${withText(l.name, l.text)}`)
    .join('\n');
}

/**
 * «Какие награды у …?» — каждая награда одной строкой в том же порядке,
 * что в блоке. `legacy` — строки наград из highlights, когда структурных
 * наград ещё нет (блок показывает их же, см. TradeCenterAwardsBlock).
 */
export function awardsFaqAnswer(awards: RetailAwardEntry[], legacy: string[] = []): string | null {
  if (!awards.length) {
    const lines = legacy.map((line) => line.replace(/\*\*/g, '').trim()).filter(Boolean);
    return lines.length ? lines.map(sentence).join('\n') : null;
  }
  return sortAwards(awards)
    .map((a) => {
      const result = awardResultLabel(a);
      const category = a.category ? `номинация «${a.category.replace(/^[«"]+|[»"]+$/g, '')}»` : null;
      // Год в скобке — только если его нет в самом названии («… 2014»).
      const year = a.year && !a.title.includes(a.year) ? a.year : null;
      const paren = [a.org, year].filter(Boolean).join(', ');
      const head = [a.title, [result, category].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
      const details = awardDetails(a, '; ');
      return [
        sentence(paren ? `${head} (${paren})` : head),
        details ? sentence(details) : null,
        a.text ? sentence(a.text) : null,
        a.confirmed ? null : 'По данным застройщика.',
      ]
        .filter(Boolean)
        .join(' ');
    })
    .join('\n');
}

/**
 * «Какие места … занимает в рейтингах торговых центров?» — тем же
 * порядком и теми же словами, что крупные строки блока:
 * «Арендопригодная площадь — крупнейшие ТЦ Минска: 4-е место из 10,
 * 52 000 м² (Onliner, 2025).»
 */
export function rankingFaqAnswer(ranking: RetailRankingEntry[]): string | null {
  if (!ranking.length) return null;
  return sortRanking(ranking)
    .map((entry) => {
      const v = rankingView(entry);
      const place = `${v.place}-е место${v.total != null ? ` из ${v.total}` : ''}${v.value ? `, ${v.value}` : ''}`;
      const cite = [v.source, v.year != null ? String(v.year) : null].filter(Boolean).join(', ');
      const line = sentence(`${v.headline}${v.scope ? ` — ${v.scope}` : ''}: ${place}${cite ? ` (${cite})` : ''}`);
      return v.note ? `${line} ${sentence(v.note)}` : line;
    })
    .join('\n');
}

// --- Посетителю: режим, парковка, проезд, удобства, скидки ---------------

export const TRANSPORT_MODE_LABELS: Record<RetailTransportMode, string> = {
  metro: 'Метро',
  bus: 'Автобус',
  trolleybus: 'Троллейбус',
  tram: 'Трамвай',
  minibus: 'Маршрутка',
  shuttle: 'Бесплатный автобус',
  car: 'На машине',
  walk: 'Пешком',
};

/** Строки в порядке схемы: метро → наземный транспорт → машина → пешком. */
export function sortTransport(transport: RetailTransportEntry[]): RetailTransportEntry[] {
  return [...transport].sort((a, b) => TRANSPORT_MODES.indexOf(a.mode) - TRANSPORT_MODES.indexOf(b.mode));
}

export function hoursFaqAnswer(hours: RetailHoursEntry[], note: string | null): string | null {
  const lines = hours.map((h) => sentence(`${h.zone}: ${h.value}${h.note ? ` (${h.note})` : ''}`));
  if (note) lines.push(sentence(note));
  return lines.length ? lines.join('\n') : null;
}

/** «Мест: 685.» — «label: value», тот же вид, что в строках блока. */
function labeledLine(item: RetailLabeledValue): string {
  return sentence(`${item.label}: ${item.value}`);
}

// Кириллица и \b несовместимы (см. CLAUDE.md) — корни ищем без границ слова.
const FREE_RE = /бесплатн/i;
const PAID_RE = /(руб|byn|платн|тариф|час)/i;

/**
 * Вопрос о парковке — ровно о том, на что есть ответ: «как бесплатно»
 * только если в данных есть бесплатный вариант, «сколько стоит» — если
 * есть цены/тарифы, иначе просто «есть ли парковка».
 */
export function parkingFaqQuestion(parking: RetailParking | null, gen: string): string | null {
  if (!parking) return null;
  const all = [parking.summary, ...parking.items.flatMap((i) => [i.label, i.value])].join(' ');
  const free = FREE_RE.test(all);
  const paid = PAID_RE.test(all.replace(/бесплатн\S*/gi, ''));
  if (paid && free) return `Сколько стоит парковка у ${gen} и можно ли встать бесплатно?`;
  if (paid) return `Сколько стоит парковка у ${gen}?`;
  if (free) return `Есть ли бесплатная парковка у ${gen}?`;
  // «Есть ли парковка…» уже спрашивает общий вопрос страницы (center.parking).
  return `Что известно о парковке у ${gen}?`;
}

export function parkingFaqAnswer(parking: RetailParking | null): string | null {
  if (!parking) return null;
  const lines = [parking.summary ? sentence(parking.summary) : null, ...parking.items.map(labeledLine)].filter(
    (line): line is string => Boolean(line),
  );
  const when = formatRetailDate(parking.date);
  if (when) lines.push(`Тарифы — по данным на ${when}.`);
  return lines.join('\n');
}

const PUBLIC_MODES = new Set<RetailTransportMode>(['metro', 'bus', 'trolleybus', 'tram', 'minibus', 'shuttle']);

/** Есть общественный транспорт — спрашиваем про него, иначе — про машину/пешком. */
export function transportFaqQuestion(transport: RetailTransportEntry[], gen: string): string | null {
  if (!transport.length) return null;
  return transport.some((t) => PUBLIC_MODES.has(t.mode))
    ? `Каким транспортом доехать до ${gen}?`
    : `Как добраться до ${gen}?`;
}

export function transportFaqAnswer(transport: RetailTransportEntry[]): string | null {
  if (!transport.length) return null;
  return sortTransport(transport)
    .map((t) => sentence(`${TRANSPORT_MODE_LABELS[t.mode]}: ${t.text}`))
    .join('\n');
}

/** "2" → "2 этаж", "-1" → "−1 этаж", "у входа А" → "у входа А". */
export function serviceFloorLabel(floor: string | null): string | null {
  return floor ? formatFloorLabel(floor) : null;
}

export function servicesFaqAnswer(services: RetailServiceEntry[]): string | null {
  if (!services.length) return null;
  return services
    .map((s) => {
      const where = serviceFloorLabel(s.floor);
      const head = where ? `${s.name} (${where})` : s.name;
      return s.text ? sentence(`${head} — ${s.text}`) : sentence(head);
    })
    .join('\n');
}

export function rulesFaqAnswer(rules: RetailRuleEntry[]): string | null {
  return rules.length ? rules.map((r) => sentence(r.text)).join('\n') : null;
}

export function loyaltyFaqAnswer(loyalty: RetailLoyaltyEntry[]): string | null {
  return loyalty.length ? loyalty.map((l) => withText(l.name, l.text)).join('\n') : null;
}

export function eventsFaqAnswer(events: RetailEventEntry[]): string | null {
  return events.length ? events.map((e) => withText(e.name, e.text, e.date)).join('\n') : null;
}

// --- Для бизнеса: аудитория, аренда, реклама, цифры, цитаты ---------------

/** Пометка под цифрой: «март 2026 · по данным ТЦ». */
export function figureMeta(entry: RetailFigureEntry): string | null {
  const parts = [formatRetailDate(entry.date), entry.note].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** «Посещаемость — 40 000 человек в день (2025, по данным ТЦ).» */
export function formatFigureLine(entry: RetailFigureEntry): string {
  const meta = [formatRetailDate(entry.date), entry.note].filter(Boolean).join(', ');
  return sentence(`${entry.label} — ${entry.value}${meta ? ` (${meta})` : ''}`);
}

const ATTENDANCE_RE = /(посещ|посетител|трафик|человек)/i;

/** «Сколько посетителей» — только если среди цифр есть посещаемость. */
export function audienceFaqQuestion(audience: RetailFigureEntry[], prep: string): string | null {
  if (!audience.length) return null;
  return audience.some((a) => ATTENDANCE_RE.test(`${a.label} ${a.value}`))
    ? `Сколько посетителей бывает в ${prep}?`
    : `Кто ходит в ${prep}?`;
}

export function figuresFaqAnswer(entries: RetailFigureEntry[]): string | null {
  return entries.length ? entries.map(formatFigureLine).join('\n') : null;
}

/** Текст, пункты и контакты — каждой строкой, как в блоке. */
export function pitchFaqAnswer(p: RetailPitch | null): string | null {
  if (!p) return null;
  const lines = [p.text ? sentence(p.text) : null, ...p.points.map(sentence)];
  if (p.contacts) lines.push(sentence(`Контакты: ${p.contacts}`));
  return lines.filter(Boolean).join('\n');
}

/** Текст цитаты без внешних кавычек: блок и FAQ ставят свои. */
export function quoteText(quote: RetailQuoteEntry): string {
  return quote.text.replace(/^[«"„“]+|[»"“”]+$/g, '').trim();
}

export function quotesFaqAnswer(quotes: RetailQuoteEntry[]): string | null {
  if (!quotes.length) return null;
  return quotes
    .map((q) => {
      const when = formatRetailDate(q.date);
      return `«${quoteText(q)}» — ${q.who}${when ? `, ${when}` : ''}.`;
    })
    .join('\n');
}

// --- Разделы страницы ----------------------------------------------------

/**
 * id карточек в разметке — они же пункты меню «На странице». Первые три —
 * состав здания, `visit` — одна карточка «Посетителю» (режим, парковка,
 * проезд, удобства, скидки), дальше — блоки для бизнес-аудитории.
 */
export type RetailSectionId = 'floors' | 'firsts' | 'leisure' | 'visit' | 'business' | 'numbers' | 'quotes';

export const RETAIL_SECTION_LABELS: Record<RetailSectionId, string> = {
  floors: 'Что на каком этаже',
  firsts: 'Первые в Беларуси и якоря',
  leisure: 'Кино, еда, развлечения',
  visit: 'Посетителю',
  business: 'Арендаторам и рекламодателям',
  numbers: 'ТЦ в цифрах',
  quotes: 'Цитаты',
};

/**
 * Две группы карточек, которые читаются подряд: «для посетителя» и «для
 * бизнеса». Рекомендацию между карточками одной группы страница переносит
 * за последнюю карточку группы, а на стыке групп — оставляет.
 */
export function retailSectionGroup(id: RetailSectionId): 'visitor' | 'business' {
  return id === 'business' || id === 'numbers' || id === 'quotes' ? 'business' : 'visitor';
}

export function hasVisitInfo(info: RetailInfo): boolean {
  return Boolean(
    info.hours.length ||
      info.hoursNote ||
      info.parking ||
      info.transport.length ||
      info.services.length ||
      info.rules.length ||
      info.loyalty.length ||
      info.events.length,
  );
}

export function hasBusinessInfo(info: RetailInfo): boolean {
  return Boolean(info.audience.length || info.leasing || info.advertising);
}

/**
 * Примерное число «строк» карточки для модели высот страницы
 * (businessCenterPageLayout). У visit панели стоят в две колонки, поэтому
 * строки делятся пополам; у business — цифры одним рядом плюс длиннейшая из
 * двух колонок «аренда / реклама».
 */
export function retailSectionSize(info: RetailInfo | null, id: RetailSectionId): number {
  if (!info) return 0;
  switch (id) {
    case 'floors':
      return info.floorsGuide.length;
    case 'firsts':
      return info.firsts.length;
    // Плитки в две колонки: высоту задаёт число рядов.
    case 'leisure':
      return Math.ceil(info.leisure.length / 2);
    case 'visit': {
      const panels = [
        info.hours.length + (info.hoursNote ? 1 : 0),
        info.parking ? info.parking.items.length + 2 : 0,
        info.transport.length,
        Math.ceil(info.services.length / 2) + info.rules.length,
        info.loyalty.length + info.events.length,
      ].filter((n) => n > 0);
      // Заголовок панели — ещё строка.
      const rows = panels.reduce((sum, n) => sum + n + 1, 0);
      return Math.ceil(rows / 2);
    }
    case 'business': {
      const pitchRows = (p: RetailPitch | null) => (p ? 2 + p.points.length + (p.contacts ? 1 : 0) : 0);
      return (info.audience.length ? 2 : 0) + Math.max(pitchRows(info.leasing), pitchRows(info.advertising));
    }
    // Плитки по три в ряд на десктопе.
    case 'numbers':
      return Math.ceil(info.numbers.length / 3);
    // Цитаты в две колонки.
    case 'quotes':
      return Math.ceil(info.quotes.length / 2);
  }
}

/** Какие карточки реально нарисуются — в порядке на странице. */
export function retailSectionIds(info: RetailInfo | null): RetailSectionId[] {
  if (!info) return [];
  const ids: RetailSectionId[] = [];
  if (info.floorsGuide.length) ids.push('floors');
  if (info.firsts.length) ids.push('firsts');
  if (info.leisure.length) ids.push('leisure');
  if (hasVisitInfo(info)) ids.push('visit');
  if (hasBusinessInfo(info)) ids.push('business');
  if (info.numbers.length) ids.push('numbers');
  if (info.quotes.length) ids.push('quotes');
  return ids;
}
