// Чистая логика для правого блока первого экрана ТЦ (владелец, 2026-09-25):
// подпись под заголовком, режим работы с онлайн-статусом, короткая сводка
// парковки, выбор трёх плиток фактов и чипы быстрых переходов. Отдельно от
// компонента (TradeCenterHeroSummary.tsx), чтобы статус «открыто/закрыто»
// можно было проверить юнит-тестом без рендера и без часового пояса машины
// теста (везде считаем время явно, а не через `new Date()` без зоны).
import type { RetailFigureEntry, RetailFoodInfo, RetailFunEntry, RetailHoursEntry, RetailInfo, RetailParking } from '../data/businessCenters';
import { pluralRu } from './pluralRu';
import { anchorsForPage, retailSectionIds } from './tradeCenterRetail';

/** «ТЦ» / «40+ м²» и т.п. — подпись строкой под «Также известен как…». */
export function tcHeroSubtitle(params: {
  retailFormat: string | null;
  floors: number | null;
  yearBuilt: number | null;
  status: string | null;
}): string {
  const parts: string[] = [params.retailFormat?.trim() || 'ТЦ'];
  if (params.floors) {
    parts.push(`${params.floors} ${pluralRu(params.floors, 'этаж', 'этажа', 'этажей')}`);
  }
  if (params.yearBuilt) {
    parts.push(params.status === 'under_construction' ? `открытие в ${params.yearBuilt}` : `с ${params.yearBuilt} года`);
  }
  return parts.join(' · ');
}

// --- Режим работы -----------------------------------------------------

/** Зона в значении которой явно нет времени работы (галерея/общий режим) — приоритет для главной строки. */
const MAIN_ZONE_HINT_RE = /торговая галере|галере|^тц$|^трц$|общий режим|главн/iu;

/** Главная зона режима работы: галерея/общий режим, иначе первая запись. */
export function pickMainHoursZone(hours: RetailHoursEntry[]): RetailHoursEntry | null {
  if (!hours.length) return null;
  return hours.find((h) => MAIN_ZONE_HINT_RE.test(h.zone)) ?? hours[0];
}

const TIME_RANGE_RE = /(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/g;
// Кириллица и \b несовместимы (см. CLAUDE.md) — границы слова через lookbehind/lookahead.
const WEEKDAY_QUALIFIER_RE = /будн|выходн|(?<![\p{L}])(?:пн|вт|ср|чт|пт|сб|вс)(?![\p{L}])/iu;

export type ParsedDailyHours = { openMin: number; closeMin: number } | 'always' | null;

/**
 * Разбирает значение вида «ежедневно 10:00–22:00» в минуты от полуночи.
 * null — разобрать нельзя (несколько диапазонов, разные дни недели, формат
 * не распознан) — тогда страница показывает сырой текст без статуса
 * «открыто/закрыто», а не гадает.
 */
export function parseDailyHours(value: string): ParsedDailyHours {
  if (!value) return null;
  if (/круглосуточно/i.test(value)) return 'always';
  const matches = [...value.matchAll(TIME_RANGE_RE)];
  if (matches.length !== 1) return null;
  // «Ежедневно» снимает подозрение в разных днях, даже если рядом есть
  // слово вроде «выходные» в другом контексте — но такое в данных не
  // встречалось, проще требовать явного «ежедневно» или отсутствия слов
  // будни/выходные/дней недели вовсе.
  if (!/ежедневно/i.test(value) && WEEKDAY_QUALIFIER_RE.test(value)) return null;
  const [, oh, om, ch, cm] = matches[0];
  const openH = Number(oh);
  const openM = Number(om);
  const closeH = Number(ch);
  const closeM = Number(cm);
  if (openH > 23 || closeH > 23 || openM > 59 || closeM > 59) return null;
  return { openMin: openH * 60 + openM, closeMin: closeH * 60 + closeM };
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Время закрытия как «эффективная» минута суток — после полуночи считаем следующим днём, для сравнений. */
function effectiveClose(parsed: { openMin: number; closeMin: number }): number {
  return parsed.closeMin > parsed.openMin ? parsed.closeMin : parsed.closeMin + 24 * 60;
}

export interface HoursLiveStatus {
  open: boolean;
  label: string;
}

/** Текущее время в Минске (Europe/Minsk) в минутах от полуночи. */
export function minskNowMinutes(now: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Minsk',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

/** «Открыто до 22:00» / «Закрыто · откроется в 10:00» — null, если разбор неоднозначен. */
export function hoursLiveStatus(parsed: ParsedDailyHours, nowMin: number): HoursLiveStatus | null {
  if (parsed === null) return null;
  if (parsed === 'always') return { open: true, label: 'Открыто круглосуточно' };
  const { openMin, closeMin } = parsed;
  const wraps = closeMin <= openMin;
  const isOpen = wraps ? nowMin >= openMin || nowMin < closeMin : nowMin >= openMin && nowMin < closeMin;
  return isOpen
    ? { open: true, label: `Открыто до ${fmtTime(closeMin)}` }
    : { open: false, label: `Закрыто · откроется в ${fmtTime(openMin)}` };
}

export interface LaterClosingZone {
  zone: string;
  label: string;
}

/**
 * Зоны, которые закрываются ПОЗЖЕ главной (например, «Гиппо до 02:00»,
 * пока «Торговая галерея» — до 22:00). Зоны с неразобранным режимом в
 * сравнение не идут — им нечего сравнивать. Отсортировано от самой поздней,
 * не больше maxCount штук.
 */
export function laterClosingZones(hours: RetailHoursEntry[], main: RetailHoursEntry | null, maxCount = 3): LaterClosingZone[] {
  if (!main) return [];
  const mainParsed = parseDailyHours(main.value);
  if (mainParsed === null) return [];
  const mainEffClose = mainParsed === 'always' ? Infinity : effectiveClose(mainParsed);
  if (mainEffClose === Infinity) return [];
  const results: (LaterClosingZone & { effClose: number })[] = [];
  for (const h of hours) {
    if (h === main) continue;
    const parsed = parseDailyHours(h.value);
    if (parsed === null) continue;
    if (parsed === 'always') {
      results.push({ zone: h.zone, label: `${h.zone} круглосуточно`, effClose: Infinity });
      continue;
    }
    const effClose = effectiveClose(parsed);
    if (effClose > mainEffClose) {
      results.push({ zone: h.zone, label: `${h.zone} до ${fmtTime(parsed.closeMin)}`, effClose });
    }
  }
  return results
    .sort((a, b) => b.effClose - a.effClose)
    .slice(0, maxCount)
    .map(({ zone, label }) => ({ zone, label }));
}

/**
 * Обрезка строки до maxLength символов с многоточием. Не CSS `truncate` —
 * тот требует ограниченной по ширине родительской цепочки (min-w-0 на каждом
 * уровне), а блок режима работы стоит в CSS grid с неявной колонкой без
 * такого ограничения: `white-space: nowrap` от truncate раздувал всю карточку
 * по ширине самой длинной строки праздничного графика (найдено на скриншоте
 * Galleria Minsk, владелец, 2026-09-25). Обрезка строки в JS этой ловушки не
 * знает — результат обычный переносимый текст.
 */
export function truncateOneLine(text: string, maxLength = 70): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

// --- Как добраться: парковка ------------------------------------------

const PARKING_PLACES_RE = /мест/iu;

/** Короткая сводка парковки (≤ ~60 символов) для строки «Как добраться». */
export function tcParkingShort(parking: RetailParking | null, maxLength = 60): string | null {
  if (!parking) return null;
  const placesItem = parking.items.find((i) => PARKING_PLACES_RE.test(i.label));
  const parts: string[] = [];
  if (placesItem) parts.push(`${placesItem.value} мест`);
  // Въезд полезнее описания здания паркинга (владелец, 2026-09-25: на
  // первом экране описание обрезалось на полуслове). summary — только
  // если нет ни мест, ни въезда.
  const entryItem = parking.items.find((i) => /въезд/iu.test(i.label) || /въезд/iu.test(i.value));
  const entry = entryItem?.value.match(/въезд[^;]*/iu)?.[0];
  if (entry) parts.push(entry);
  if (!parts.length && parking.summary) parts.push(parking.summary);
  if (!parts.length && parking.items[0]) parts.push(`${parking.items[0].label}: ${parking.items[0].value}`);
  if (!parts.length) return null;
  let text = parts.join(' · ');
  if (text.length > maxLength) text = `${text.slice(0, maxLength - 1).trimEnd()}…`;
  return text;
}

/** Число мест на парковке отдельной строкой — запасная плитка фактов. */
export function tcParkingSpaces(parking: RetailParking | null): string | null {
  const item = parking?.items.find((i) => PARKING_PLACES_RE.test(i.label));
  return item ? item.value : null;
}

// --- Плитки фактов ------------------------------------------------------

const AUDIENCE_VISITORS_RE = /посетител/iu;
const AUDIENCE_PERIOD_RE = /день|сутки|будн/iu;

/** «Посетителей в день» из retail_info.audience — только явно суточная цифра. */
export function tcAudienceVisitorsPerDay(audience: RetailFigureEntry[]): string | null {
  const entry = audience.find((a) => AUDIENCE_VISITORS_RE.test(a.label) && AUDIENCE_PERIOD_RE.test(a.label));
  // «в день» уже стоит в подписи плитки — не повторять его в значении.
  return entry ? entry.value.replace(/\s+в\s+(день|сутки)\s*$/iu, '') : null;
}

export type TcFactTileKind = 'tenants' | 'area' | 'audience' | 'parking' | 'rating';

export interface TcFactTileData {
  kind: TcFactTileKind;
  value: string;
  label: string;
}

/**
 * До трёх плиток фактов в порядке приоритета: сначала число арендаторов,
 * площадь и посещаемость — если их нет, добираем местами на парковке и
 * рейтингом Яндекс.Карт.
 */
export function selectTcFactTiles(params: {
  tenantCount: number;
  totalArea: number | null;
  audienceValue: string | null;
  parkingSpaces: string | null;
  mapRatingLabel: string | null;
}): TcFactTileData[] {
  const primary: TcFactTileData[] = [];
  if (params.tenantCount > 0) {
    primary.push({ kind: 'tenants', value: String(params.tenantCount), label: 'Магазинов и сервисов' });
  }
  if (params.totalArea != null) {
    primary.push({ kind: 'area', value: `${params.totalArea.toLocaleString('ru-RU')} м²`, label: 'Торговая площадь' });
  }
  if (params.audienceValue) {
    primary.push({ kind: 'audience', value: params.audienceValue, label: 'Посетителей в день' });
  }
  const fallback: TcFactTileData[] = [];
  if (params.parkingSpaces) {
    fallback.push({ kind: 'parking', value: params.parkingSpaces, label: 'Мест на парковке' });
  }
  if (params.mapRatingLabel) {
    fallback.push({ kind: 'rating', value: params.mapRatingLabel, label: 'Яндекс.Карты' });
  }
  return [...primary, ...fallback].slice(0, 3);
}

// --- Якорные арендаторы и быстрые переходы ------------------------------

/** Имена якорей для чипов — не больше maxCount. */
export function tcAnchorChipNames(info: RetailInfo | null, maxCount = 6): string[] {
  return anchorsForPage(info)
    .map((a) => a.name)
    .slice(0, maxCount);
}

export type TcQuickJumpId = 'food' | 'fun' | 'business';

export interface TcQuickJumpChip {
  id: TcQuickJumpId;
  label: string;
}

/** Чипы быстрого перехода — только к разделам, которые страница реально рисует (retailSectionIds). */
export function tcQuickJumpChips(info: RetailInfo | null): TcQuickJumpChip[] {
  if (!info) return [];
  const ids = new Set(retailSectionIds(info));
  const chips: TcQuickJumpChip[] = [];
  if (ids.has('food')) {
    const count = tcFoodPointsCount(info.food);
    chips.push({ id: 'food', label: count > 0 ? `Где поесть · ${count}` : 'Где поесть' });
  }
  if (ids.has('fun')) {
    const first = info.fun[0]?.name;
    chips.push({ id: 'fun', label: first ? `Развлечения · ${first}` : 'Развлечения' });
  }
  if (ids.has('business')) {
    chips.push({ id: 'business', label: 'Арендаторам' });
  }
  return chips;
}

/** Число заведений — счётчик у чипа «Где поесть». */
export function tcFoodPointsCount(food: RetailFoodInfo | null): number {
  return food?.places.length ?? 0;
}

/** Первое развлечение — для подписи чипа, если оно есть. */
export function tcFirstFunName(fun: RetailFunEntry[]): string | null {
  return fun[0]?.name ?? null;
}
