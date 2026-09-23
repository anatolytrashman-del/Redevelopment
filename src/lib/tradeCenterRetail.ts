// Торговые блоки карточки ТЦ (2026-09-23): разбор jsonb-колонки
// business_centers.retail_info и чистые функции, которыми пользуются и
// видимые блоки (components/businessCenters/TradeCenterRetailBlocks.tsx), и
// FAQ карточки. Одни и те же функции на обе стороны — чтобы FAQ не
// пересказывал блок своими словами и не расходился с ним.
import type {
  RetailFirstEntry,
  RetailFloorEntry,
  RetailInfo,
  RetailLeisureEntry,
  RetailLeisureKind,
  RetailRankingEntry,
  RetailSource,
} from '../data/businessCenters';

const FIRST_KINDS = new Set(['first', 'anchor', 'former_anchor']);
const LEISURE_KINDS = new Set(['cinema', 'food', 'kids', 'sport', 'other']);

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sourceOf(raw: Record<string, unknown>): RetailSource {
  return { source: str(raw.source), sourceUrl: str(raw.sourceUrl) };
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : [];
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
    return [{ place, criterion, scope: str(r.scope) ?? '', total: num(r.total), year: num(r.year), ...sourceOf(r) }];
  });

  if (!floorsGuide.length && !firsts.length && !leisure.length && !ranking.length) return null;
  return { floorsGuide, firsts, leisure, ranking };
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

// --- Рейтинг -------------------------------------------------------------

/**
 * "4-й по арендопригодной площади среди ТЦ Минска (Onliner, 2025)".
 * С total — "4-й из 30 …". Скобка — только из того, что есть: источник,
 * год или оба. `form: 'place'` — для связного текста FAQ: "4-е место …".
 */
export function formatRankingLine(entry: RetailRankingEntry, form: 'short' | 'place' = 'short'): string {
  const ordinal = form === 'place' ? `${entry.place}-е место` : `${entry.place}-й`;
  const head = entry.total != null && entry.total >= entry.place ? `${ordinal} из ${entry.total}` : ordinal;
  const body = [head, entry.criterion, entry.scope].map((part) => part.trim()).filter(Boolean).join(' ');
  const note = [entry.source, entry.year != null ? String(entry.year) : null].filter(Boolean).join(', ');
  return note ? `${body} (${note})` : body;
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

export function rankingFaqAnswer(ranking: RetailRankingEntry[]): string | null {
  if (!ranking.length) return null;
  return ranking.map((r) => sentence(formatRankingLine(r, 'place'))).join('\n');
}

// --- Разделы страницы ----------------------------------------------------

/** id карточек в разметке — они же пункты меню «На странице». */
export type RetailSectionId = 'floors' | 'firsts' | 'leisure';

export const RETAIL_SECTION_LABELS: Record<RetailSectionId, string> = {
  floors: 'Что на каком этаже',
  firsts: 'Первые в Беларуси и якоря',
  leisure: 'Кино, еда, развлечения',
};

/** Какие карточки реально нарисуются — в порядке на странице. */
export function retailSectionIds(info: RetailInfo | null): RetailSectionId[] {
  if (!info) return [];
  const ids: RetailSectionId[] = [];
  if (info.floorsGuide.length) ids.push('floors');
  if (info.firsts.length) ids.push('firsts');
  if (info.leisure.length) ids.push('leisure');
  return ids;
}
