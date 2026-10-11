// Чистая логика для правого блока первого экрана ТЦ (владелец, 2026-09-25):
// подпись под заголовком, режим работы с онлайн-статусом, короткая сводка
// парковки, выбор трёх плиток фактов и чипы быстрых переходов. Отдельно от
// компонента (TradeCenterHeroSummary.tsx), чтобы статус «открыто/закрыто»
// можно было проверить юнит-тестом без рендера и без часового пояса машины
// теста (везде считаем время явно, а не через `new Date()` без зоны).
import type { RetailFigureEntry, RetailFoodInfo, RetailFunEntry, RetailHoursEntry, RetailInfo, RetailParking } from '../data/businessCenters';
import { pluralRu } from './pluralRu';
import { parkingSpacesShort } from './tradeCenterVisit';
import { FUN_KIND_LABELS, anchorsForPage, retailSectionIds, sortFun } from './tradeCenterRetail';

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

/** Первая фраза без скобок, если она целиком влезает в maxLength, иначе null. */
function shortClause(text: string, maxLength: number): string | null {
  const head = text.replace(/\([^)]*\)?/g, ' ').split(/;|\s[—–-]\s|(?<=[.!?])\s/u)[0].replace(/\s+/g, ' ').replace(/[\s,.]+$/, '').trim();
  return head && head.length <= maxLength ? head : null;
}

/**
 * Короткая сводка парковки для строки «Как добраться». Текст не обрезаем
 * многоточием: берём только то, что влезает целиком (места, въезд), а
 * длинное описание остаётся в блоке парковки ниже.
 */
export function tcParkingShort(parking: RetailParking | null, maxLength = 60): string | null {
  if (!parking) return null;
  const placesItem = parking.items.find((i) => PARKING_PLACES_RE.test(i.label));
  const parts: string[] = [];
  const places = parkingSpacesShort(placesItem?.value);
  if (places) parts.push(`${places} мест`);
  // Въезд полезнее описания здания паркинга (владелец, 2026-09-25).
  const entryItem = parking.items.find((i) => /въезд/iu.test(i.label) || /въезд/iu.test(i.value));
  const entryRaw = entryItem?.value.match(/въезд[^;]*/iu)?.[0];
  const entry = entryRaw ? shortClause(entryRaw, maxLength - (parts.join(' · ').length + 3)) : null;
  if (entry) parts.push(entry);
  if (!parts.length && parking.summary) {
    const summary = shortClause(parking.summary, maxLength);
    if (summary) parts.push(summary);
  }
  if (!parts.length && parking.items[0]) {
    const first = shortClause(`${parking.items[0].label}: ${parking.items[0].value}`, maxLength);
    if (first) parts.push(first);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Число мест на парковке отдельной строкой — запасная плитка фактов. */
export function tcParkingSpaces(parking: RetailParking | null): string | null {
  const item = parking?.items.find((i) => PARKING_PLACES_RE.test(i.label));
  return parkingSpacesShort(item?.value);
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

export type TcQuickJumpId = 'floors' | 'getting-here' | 'anchors' | 'food' | 'fun';

export interface TcQuickJumpChip {
  id: TcQuickJumpId;
  label: string;
}

/**
 * Чипы быстрого перехода — только к разделам, которые страница реально
 * рисует. Порядок посетителя (2026-10-11): схема, парковка, якоря, еда,
 * развлечения. Аренда и реклама в чипы не попадают — ими почти не жмут.
 */
export function tcQuickJumpChips(info: RetailInfo | null): TcQuickJumpChip[] {
  if (!info) return [];
  const ids = new Set(retailSectionIds(info));
  const chips: TcQuickJumpChip[] = [];
  if (ids.has('floors')) chips.push({ id: 'floors', label: 'Что где' });
  if (ids.has('getting-here')) chips.push({ id: 'getting-here', label: 'Парковка' });
  if (ids.has('anchors')) {
    const count = anchorsForPage(info).length;
    chips.push({ id: 'anchors', label: count > 0 ? `Якоря · ${count}` : 'Якоря' });
  }
  if (ids.has('food')) {
    const count = tcFoodPointsCount(info.food);
    chips.push({ id: 'food', label: count > 0 ? `Где поесть · ${count}` : 'Где поесть' });
  }
  if (ids.has('fun')) {
    const first = info.fun[0]?.name;
    chips.push({ id: 'fun', label: first ? `Развлечения · ${first}` : 'Развлечения' });
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

// --- Главный экран: ценность «зачем ехать» (без чипов — владелец их снял) ---

/** Короткая подпись развлечения для оверлея/строк: «Кино», «Каток», имя детского. */
function funLeadLabel(entry: RetailFunEntry): string {
  if (entry.kind === 'cinema') return 'Кино';
  if (entry.kind === 'ice') return 'Каток';
  if (entry.kind === 'kids' || entry.kind === 'concert') return entry.name;
  return FUN_KIND_LABELS[entry.kind] || entry.name;
}

/**
 * Строка на фото: зачем сюда ехать одним взглядом.
 * «Кино · Каток · Discovery Maxi · Prime Hall» — без обрыва.
 */
export function tcHeroPhotoLead(info: RetailInfo | null, maxParts = 4): string | null {
  if (!info) return null;
  const parts: string[] = [];
  for (const entry of sortFun(info.fun)) {
    const label = funLeadLabel(entry);
    if (!parts.includes(label)) parts.push(label);
    if (parts.length >= maxParts) break;
  }
  if (parts.length) return parts.join(' · ');
  const anchors = anchorsForPage(info).slice(0, 3).map((a) => a.name);
  return anchors.length ? anchors.join(' · ') : null;
}

export interface TcHeroInsideLine {
  href: string;
  label: string;
  detail: string;
}

/**
 * Inventory-строки «что внутри» (как на карточке casinolist: ответ сразу,
 * не пилюли-чипы). До трёх строк со ссылкой в раздел.
 */
export function tcHeroInsideLines(info: RetailInfo | null): TcHeroInsideLine[] {
  if (!info) return [];
  const lines: TcHeroInsideLine[] = [];
  const anchors = anchorsForPage(info).slice(0, 3);
  if (anchors.length) {
    lines.push({
      href: '#anchors',
      label: 'Якоря',
      detail: anchors.map((a) => a.name).join(' · '),
    });
  }
  const fun = sortFun(info.fun).slice(0, 3);
  if (fun.length) {
    lines.push({
      href: '#fun',
      label: 'Развлечения',
      detail: fun.map((entry) => funLeadLabel(entry)).join(' · '),
    });
  }
  const foodCount = info.food?.places.length ?? 0;
  if (foodCount > 0) {
    lines.push({
      href: '#food',
      label: 'Где поесть',
      detail: `${foodCount}\u00a0${pluralRu(foodCount, 'заведение', 'заведения', 'заведений')}`,
    });
  }
  return lines.slice(0, 3);
}

/**
 * Alt-имена, которые реально отличаются от заголовка (не «ТРЦ Замок» /
 * «ТЦ Замок» рядом с «ТРЦ «Замок»»).
 */
export function tcMeaningfulAltNames(name: string, altNames: string[]): string[] {
  const strip = (value: string) =>
    value
      .toLowerCase()
      .replace(/[«»"'„“]/g, '')
      .replace(/^(трц|тц|трк|молл)\s+/u, '')
      .replace(/\s+/g, ' ')
      .trim();
  const base = strip(name);
  return altNames.filter((alt) => {
    const n = strip(alt);
    return n.length > 0 && n !== base;
  });
}

export type TcMustHaveKind = 'parking' | 'fun' | 'food' | 'anchor' | 'hours' | 'metro';

export interface TcMustHaveItem {
  kind: TcMustHaveKind;
  label: string;
  value: string;
  href?: string;
}

/**
 * Must-have саммари для первого экрана: парковка, якоря, развлечения, еда —
 * короткие ответы одной высоты (владелец, 2026-10-11). Без дубля статуса
 * «открыто» (он в «Сейчас») и без длинных списков имён в плитке — иначе
 * «Парковка» и «Якоря» разъезжаются по высоте. Якоря: счёт (их обычно 5–7),
 * не два имени «ради одного».
 */
export function tcMustHaveItems(info: RetailInfo | null, opts?: {
  parkingShort?: string | null;
  metroLabel?: string | null;
}): TcMustHaveItem[] {
  if (!info) return [];
  const items: TcMustHaveItem[] = [];
  if (opts?.parkingShort) {
    items.push({ kind: 'parking', label: 'Парковка', value: opts.parkingShort, href: '#getting-here' });
  }
  if (opts?.metroLabel) {
    items.push({ kind: 'metro', label: 'Метро', value: opts.metroLabel, href: '#getting-here' });
  }
  const anchors = anchorsForPage(info);
  if (anchors.length >= 3) {
    items.push({
      kind: 'anchor',
      label: 'Якоря',
      value: `${anchors.length}\u00a0${pluralRu(anchors.length, 'якорь', 'якоря', 'якорей')}`,
      href: '#anchors',
    });
  } else if (anchors.length > 0) {
    items.push({
      kind: 'anchor',
      label: 'Якоря',
      value: anchors.map((a) => a.name).join(' · '),
      href: '#anchors',
    });
  }
  // До двух коротких ярлыков — иначе плитка шире «6 якорей» / «22 заведения».
  const fun = sortFun(info.fun).slice(0, 2);
  if (fun.length > 0) {
    items.push({
      kind: 'fun',
      label: 'Развлечения',
      value: fun.map((entry) => funLeadLabel(entry)).join(' · '),
      href: '#fun',
    });
  }
  const foodCount = info.food?.places.length ?? 0;
  if (foodCount > 0) {
    items.push({
      kind: 'food',
      label: 'Еда',
      value: `${foodCount}\u00a0${pluralRu(foodCount, 'заведение', 'заведения', 'заведений')}`,
      href: '#food',
    });
  }
  return items.slice(0, 6);
}

export interface TcFitPoint {
  side: 'win' | 'lose';
  text: string;
}

/**
 * Сравнение с аналогами в духе casinolist «кому подойдёт»:
 * выигрывает / проигрывает — только из фактов карточки.
 */
export function tcFitPoints(info: RetailInfo | null, params: {
  parkingSpaces: string | null;
  tenantCount: number;
  hasMetro: boolean;
  totalArea: number | null;
}): TcFitPoint[] {
  if (!info) return [];
  const points: TcFitPoint[] = [];
  const funKinds = new Set(info.fun.map((f) => f.kind));
  const foodCount = info.food?.places.length ?? 0;
  const parkingN = params.parkingSpaces ? Number(String(params.parkingSpaces).replace(/[^\d]/g, '')) : null;
  const spacesLabel = params.parkingSpaces
    ? String(params.parkingSpaces).replace(/^более\s+/iu, '').replace(/\s+мест$/iu, '')
    : null;

  if (funKinds.has('cinema') && funKinds.has('ice')) {
    points.push({ side: 'win', text: 'Кино и каток в одном комплексе — у многих ТЦ только одно из двух.' });
  } else if (funKinds.has('cinema') || funKinds.has('kids')) {
    points.push({ side: 'win', text: 'Свой блок развлечений (кино или дети) — не только торговая галерея.' });
  } else if (info.fun.length === 0) {
    points.push({ side: 'lose', text: 'Без своего кино/катка/детского центра — слабее досуговых ТРЦ.' });
  }
  if (parkingN != null && parkingN >= 1000) {
    points.push({ side: 'win', text: `Парковка около ${spacesLabel} мест — заметно больше типичного районного ТЦ.` });
  } else if (!params.parkingSpaces) {
    points.push({ side: 'lose', text: 'Нет сводки по числу мест — проигрывает ТЦ с явной большой парковкой.' });
  }
  if (foodCount >= 15) {
    points.push({ side: 'win', text: `${foodCount} ${pluralRu(foodCount, 'точка', 'точки', 'точек')} еды — шире выбор, чем у компактных ТЦ.` });
  } else if (foodCount > 0 && foodCount < 8) {
    points.push({ side: 'lose', text: 'Фуд-выбор скромный — проигрывает ТРЦ с большим фудкортом.' });
  }
  if (params.hasMetro) {
    points.push({ side: 'win', text: 'Есть привязка к метро — удобнее аналогов «только на машине».' });
  } else {
    points.push({ side: 'lose', text: 'Без станции у входа — проигрывает ТЦ у метро.' });
  }
  if (params.tenantCount >= 300) {
    points.push({ side: 'win', text: `${params.tenantCount} магазинов и сервисов — крупный состав по меркам города.` });
  } else if (params.tenantCount > 0 && params.tenantCount < 80) {
    points.push({ side: 'lose', text: 'Небольшой состав арендаторов — слабее крупных ТРЦ по выбору брендов.' });
  }
  if (params.totalArea != null && params.totalArea >= 80000) {
    points.push({ side: 'win', text: 'Крупная торговая площадь — в ряду главных ТРЦ города.' });
  } else if (params.totalArea != null && params.totalArea < 40000) {
    points.push({ side: 'lose', text: 'Площадь скромнее крупнейших ТРЦ — меньше «всего в одном месте».' });
  }
  // Не больше 3+3, без пустого «всё хорошо».
  const wins = points.filter((p) => p.side === 'win').slice(0, 3);
  const loses = points.filter((p) => p.side === 'lose').slice(0, 3);
  return [...wins, ...loses];
}
