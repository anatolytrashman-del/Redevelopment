// Шаблон title карточек ТЦ malllist.pro (владелец, 2026-10-31):
//   «ТЦ {Название} — независимый обзор | {месяц} {год}»
// Месяц — именительный, строчными, по календарю Минска. Длиннее 60 символов —
// без «ТЦ ». Название без кавычек.
//
// Месяц меняется 1-го числа БЕЗ деплоя: пререндер кладёт в HTML месяц сборки,
// а middleware.ts на запросе карточки подменяет «независимый обзор | <месяц
// год>» на текущий (replaceReviewMonth ниже). В браузере тот же текст считает
// страница (document.title) — тоже на текущую дату. Модуль без зависимостей:
// его импортирует edge-middleware.

export const MONTHS_NOMINATIVE = [
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
] as const;

export const TC_TITLE_MAX_CHARS = 60;
export const REVIEW_MARKER = 'независимый обзор |';

/** Год и месяц (1–12) в Europe/Minsk. */
export function minskYearMonth(now: Date = new Date()): { year: number; month: number } {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Minsk', year: 'numeric', month: '2-digit' })
    .format(now)
    .split('-')
    .map(Number);
  return { year: y, month: m };
}

/** «ноябрь 2026» — текущий месяц в Минске. */
export function reviewMonthLabel(now: Date = new Date()): string {
  const { year, month } = minskYearMonth(now);
  return `${MONTHS_NOMINATIVE[month - 1]} ${year}`;
}

/** «ноябрь 2026» для ISO-даты (YYYY-MM-DD…), по календарю Минска. */
export function monthLabelForIso(iso: string): string {
  return reviewMonthLabel(new Date(iso));
}

/** Название без кавычек и без родового префикса («ТЦ», «Торговый центр»…). */
export function tcTitleName(name: string): string {
  const quoted = name.match(/«([^»]+)»/);
  const base = quoted ? quoted[1] : name;
  return base
    .replace(/^(?:торгово-развлекательный центр|торгово-офисный центр|торговый центр|трц|тц|тоц|тк)\s+/iu, '')
    .replace(/[«»"„“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tcReviewTitle(name: string, now: Date = new Date()): string {
  const clean = tcTitleName(name);
  const tail = ` — ${REVIEW_MARKER} ${reviewMonthLabel(now)}`;
  const full = `ТЦ ${clean}${tail}`;
  return full.length > TC_TITLE_MAX_CHARS ? `${clean}${tail}` : full;
}

// «независимый обзор | ноябрь 2026» (карточки, хабы) и «независимый
// справочник | ноябрь 2026» (корень malllist.pro).
const REVIEW_MONTH_RE = new RegExp(
  `(независимый (?:обзор|справочник) \\| )(?:${MONTHS_NOMINATIVE.join('|')}) (?:\\d{4})`,
  'g',
);

/**
 * Подменяет месяц во всех «независимый обзор | <месяц> <год>» (title, og:title,
 * twitter:title, JSON-LD headline). Длина title от месяца меняется на ±3
 * символа — порог 60 мог бы «переключить» вариант с «ТЦ » и без; это
 * допустимо: страница на клиенте пересчитает точный вариант сама.
 */
export function replaceReviewMonth(html: string, now: Date = new Date()): string {
  const label = reviewMonthLabel(now);
  return html.replace(REVIEW_MONTH_RE, `$1${label}`);
}

export const TC_INDEPENDENCE_NOTE =
  'Независимый обзор: мы не связаны с ТЦ и не берём денег за размещение и отзывы';

/** Описание карточки ТЦ; числа — только если они есть в данных. */
export function tcReviewDescription(tenantCount: number, foodCount: number): string {
  const shops = tenantCount > 0 ? `Магазины по этажам (${tenantCount} ${plural(tenantCount, 'арендатор', 'арендатора', 'арендаторов')})` : 'Магазины по этажам';
  const food =
    foodCount > 0 ? `где поесть (${foodCount} ${plural(foodCount, 'заведение', 'заведения', 'заведений')}) и припарковаться` : 'где поесть и припарковаться';
  return `${shops}, ${food}, отзывы посетителей, факты и сравнение с соседними ТЦ Минска.`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
