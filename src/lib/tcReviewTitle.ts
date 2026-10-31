// Шаблон title карточек ТЦ malllist.pro (владелец, 2026-10-31):
//   «ТЦ {Название} — независимый обзор | {месяц} {год}»
// Месяц — именительный, строчными, по календарю Минска. Длиннее 60 символов —
// без «ТЦ ». Название без кавычек.
//
// Месяц — месяц СБОРКИ (снимка данных) по Минску, а не «сегодня» (SEO-ревью
// 2026-10-31, блокеры D/E): title в статическом HTML, title на клиенте,
// бейдж «Обновлено» и JSON-LD dateModified берут одну дату — __BUILD_TIME__.
// Middleware месяц больше не подменяет; плановых пересборок нет — месяц
// меняется с очередным деплоем. Модуль без зависимостей.

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

/**
 * Дата снимка данных: время сборки (vite define __BUILD_TIME__). Вне сборки
 * (vitest, node-скрипты) — текущий момент; тесты передают дату явно.
 */
export function contentDate(): Date {
  return typeof __BUILD_TIME__ === 'string' && __BUILD_TIME__ ? new Date(__BUILD_TIME__) : new Date();
}

/** YYYY-MM-DD даты сборки по Минску — для JSON-LD dateModified. */
export function contentDateIso(now: Date = contentDate()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Minsk', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Год и месяц (1–12) в Europe/Minsk. */
export function minskYearMonth(now: Date = contentDate()): { year: number; month: number } {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Minsk', year: 'numeric', month: '2-digit' })
    .format(now)
    .split('-')
    .map(Number);
  return { year: y, month: m };
}

/** «ноябрь 2026» — месяц сборки (по умолчанию) в Минске. */
export function reviewMonthLabel(now: Date = contentDate()): string {
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

/**
 * Ручные названия для title карточек, где имя из базы не читается как ТЦ
 * (SEO-ревью 2026-10-31, решение 2). Значение — полная фраза до « — ».
 */
export const TC_TITLE_NAME_OVERRIDES: Record<string, string> = {
  'mayakovskogo-146': 'ТЦ на Маяковского, 146',
};

export function tcReviewTitle(name: string, now: Date = contentDate(), slug?: string): string {
  const tail = ` — ${REVIEW_MARKER} ${reviewMonthLabel(now)}`;
  const override = slug ? TC_TITLE_NAME_OVERRIDES[slug] : undefined;
  if (override) return `${override}${tail}`;
  const clean = tcTitleName(name);
  const full = `ТЦ ${clean}${tail}`;
  return full.length > TC_TITLE_MAX_CHARS ? `${clean}${tail}` : full;
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
