// Торговые блоки карточки ТЦ (2026-09-23): разбор jsonb-колонки
// business_centers.retail_info и чистые функции, которыми пользуются и
// видимые блоки (components/businessCenters/TradeCenterRetailBlocks.tsx), и
// FAQ карточки. Одни и те же функции на обе стороны — чтобы FAQ не
// пересказывал блок своими словами и не расходился с ним.
import {
  RETAIL_ANCHOR_CATEGORIES,
  RETAIL_FOOD_PLACE_TYPES,
  RETAIL_FUN_KINDS,
  RETAIL_SERVICE_GROUPS,
} from '../data/businessCenters';
import { hasGettingHereInfo, hasOffersEventsInfo, transportForVisit, parkingForVisit, eventsForVisit } from './tradeCenterVisit';
import { groupNumbers } from './tradeCenterNumbers';
import { pluralRu } from './pluralRu';
import type {
  RetailAnchorCategory,
  RetailAnchorEntry,
  RetailAwardEntry,
  RetailAwardResult,
  RetailEventEntry,
  RetailFigureEntry,
  RetailFloorEntry,
  RetailFoodInfo,
  RetailFoodPlace,
  RetailFoodPlaceType,
  RetailFoodZone,
  RetailFunEntry,
  RetailFunKind,
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
  RetailServiceGroup,
  RetailSource,
  RetailTimelineEntry,
  RetailTimelineKind,
  RetailTransportEntry,
  RetailTransportMode,
  RetailVacancyEntry,
} from '../data/businessCenters';

export const TIMELINE_KINDS: RetailTimelineKind[] = ['first', 'first_format', 'record', 'milestone'];
const TIMELINE_KIND_SET = new Set<string>(TIMELINE_KINDS);
const ANCHOR_CATEGORY_SET = new Set<string>(RETAIL_ANCHOR_CATEGORIES);
export const AWARD_RESULTS: RetailAwardResult[] = ['winner', 'diploma', 'laureate', 'finalist', 'nominee', 'other'];
const AWARD_RESULT_SET = new Set<string>(AWARD_RESULTS);
const LEISURE_KINDS = new Set(['cinema', 'food', 'kids', 'sport', 'other']);
const FOOD_PLACE_TYPE_SET = new Set<string>(RETAIL_FOOD_PLACE_TYPES);
const FUN_KIND_SET = new Set<string>(RETAIL_FUN_KINDS);
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

const SERVICE_GROUP_SET = new Set<string>(RETAIL_SERVICE_GROUPS);

export const RETAIL_SERVICE_GROUP_LABELS: Record<RetailServiceGroup, string> = {
  info: 'Информация и связь',
  comfort: 'Комфорт',
  family: 'С детьми',
  access: 'Доступная среда',
  money: 'Деньги',
  car: 'Транспорт',
  everyday: 'Бытовые услуги',
  eco: 'Экология',
};

// Группа удобства по названию — для записей ресёрча без поля group (все,
// что собраны до 2026-09-24). Порядок проверок важен: «Сбор ненужной
// одежды» — экология, а не бытовая услуга; «Туалеты для маломобильных» —
// доступная среда, а не комфорт; коляска у «маломобильных» — кресло, у
// «матери и ребёнка» — детская. Всё, что не узналось, — «Комфорт»: туалеты,
// гардеробы, камеры хранения, места отдыха, зарядка телефона.
const SERVICE_GROUP_RULES: [RetailServiceGroup, RegExp][] = [
  ['eco', /сбор\p{L}*|батаре|вторсыр|переработ|утилиз|раздельн|эко(?![\p{L}])|приём\p{L}* (ненужн|старо|техник)/iu],
  ['access', /инвалид|маломобил|доступн\p{L}* сред|пандус|кресл\p{L}*-колясок|кресл\p{L}*-коляс|лифт|траволатор|эскалатор|слабовидящ|тактильн/iu],
  ['family', /дет(ей|ск|и(?![\p{L}]))|реб[её]н|матер|пеленал|коляс|стульчик|кормлен|именинник|игров/iu],
  ['money', /банк|обмен|валют|терминал|оплат/iu],
  ['car', /парков|паркинг|автомо|мойк|шиномонтаж|электромобил|электрозаряд|такси|вело/iu],
  ['info', /инфо|информац|справочн|wi-?fi|вай-?фай|интернет|виртуальн|панорам|билет|приложени/iu],
  ['everyday', /химчист|ремонт|ателье|ключ|аптек|оптик|турагент|салон|красот|упаковк|подар|почт|постамат|пункт\p{L}* выдачи|фото|печат|копир|услуг/iu],
];

/** Группа удобства ТЦ, выведенная из названия; не узналось — «Комфорт». */
export function serviceGroupFromName(name: string): RetailServiceGroup {
  return SERVICE_GROUP_RULES.find(([, re]) => re.test(name))?.[0] ?? 'comfort';
}

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
    return label && v ? [{ label, value: v, date: str(r.date), note: str(r.note), text: str(r.text), ...sourceOf(r) }] : [];
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

function httpUrl(value: unknown): string | null {
  const url = str(value);
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/** Незнакомая категория — «другое»: якорь от этого не перестаёт быть якорем. */
function anchorCategory(value: unknown): RetailAnchorCategory {
  const category = str(value)?.toLowerCase().replace(/ё/g, 'е') ?? '';
  return (ANCHOR_CATEGORY_SET.has(category) ? category : 'другое') as RetailAnchorCategory;
}

/** «Евроопт» (формат Euroopt Super) → «евроопт»: имя бренда без кавычек и пояснений. */
function brandKey(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .replace(/[«»"„“”']/g, '')
    .trim()
    .toLowerCase();
}

/** Начало даты «2019-03-15» / «2019-03» / «2019» — иначе записи нет места на ленте. */
const TIMELINE_DATE_RE = /^\d{4}(?:-\d{1,2}){0,2}$/;

/**
 * Якоря и лента достижений (2026-09-24). Новая схема — `anchors` и
 * `timeline`; у ТЦ, которых ресёрч по ней ещё не прошёл, есть только старые
 * `firsts`, и они раскладываются так: anchor → якорь (без этажа, площади,
 * года и категории — их в старых записях нет, а дата там — дата публикации,
 * а не прихода в ТЦ), first → строка ленты вида first. former_anchor не
 * показывается нигде: владелец, 2026-09-24, — уходы в карточку не пишем.
 * Старые записи берутся, только если ни одного из новых ключей нет: новый
 * ресёрч заменяет старый целиком, и пустой `timeline: []` у него значит
 * «достижений не нашли», а не «возьми старое».
 */
function anchorsAndTimeline(data: Record<string, unknown>): {
  anchors: RetailAnchorEntry[];
  timeline: RetailTimelineEntry[];
} {
  if (Array.isArray(data.anchors) || Array.isArray(data.timeline)) {
    const anchors: RetailAnchorEntry[] = records(data.anchors).flatMap((r) => {
      const name = str(r.name);
      if (!name) return [];
      return [
        {
          name,
          category: anchorCategory(r.category),
          floor: text(r.floor),
          area: text(r.area),
          since: text(r.since),
          text: str(r.text) ?? '',
          yandexUrl: httpUrl(r.yandexUrl),
          ...sourceOf(r),
        },
      ];
    });
    const timeline: RetailTimelineEntry[] = records(data.timeline).flatMap((r) => {
      const name = str(r.name);
      const kind = str(r.kind);
      const date = text(r.date);
      if (!name || !kind || !TIMELINE_KIND_SET.has(kind) || !date || !TIMELINE_DATE_RE.test(date)) return [];
      return [{ date, kind: kind as RetailTimelineKind, name, text: str(r.text) ?? '', note: str(r.note), ...sourceOf(r) }];
    });
    return { anchors, timeline: sortTimeline(timeline) };
  }
  const anchors: RetailAnchorEntry[] = [];
  const timeline: RetailTimelineEntry[] = [];
  // «Первый в Беларуси» бренда, который потом ушёл (тот же бренд есть среди
  // former_anchor этого ТЦ), — тоже рассказ про уход: бриф запрещает
  // упоминать ушедшие бренды и в истории. Так у Galleria Minsk уходят
  // Reserved и H&M.
  const departed = new Set(
    records(data.firsts).flatMap((r) => (str(r.kind) === 'former_anchor' && str(r.name) ? [brandKey(str(r.name)!)] : [])),
  );
  for (const r of records(data.firsts)) {
    const name = str(r.name);
    const kind = str(r.kind);
    if (!name) continue;
    if (kind === 'anchor') {
      anchors.push({ name, category: null, floor: null, area: null, since: null, text: str(r.text) ?? '', yandexUrl: null, ...sourceOf(r) });
    } else if (kind === 'first' && !departed.has(brandKey(name))) {
      const date = str(r.date);
      if (date && TIMELINE_DATE_RE.test(date)) {
        timeline.push({ date, kind: 'first', name, text: str(r.text) ?? '', note: null, ...sourceOf(r) });
      }
    }
  }
  return { anchors, timeline: sortTimeline(timeline) };
}

/** true/false и их строковые формы; всё прочее — «неизвестно». */
function bool(value: unknown): boolean | null {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

/** Ключ склейки заведений: «Кофе Хауз» и «кофе хауз» — одно место. */
function placeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"„“”']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Одно заведение, записанное ресёрчем дважды (так бывает с сетями на двух
 * этажах), — одна строка: известные поля берутся из первой записи,
 * пропуски — из следующих, разные этажи перечисляются через запятую.
 */
function mergePlace(a: RetailFoodPlace, b: RetailFoodPlace): RetailFoodPlace {
  // У склеенной записи этажи уже через запятую — третья копия не должна их повторить.
  const floors = [a.floor, b.floor].flatMap((f) => (f ? f.split(/,\s*/) : [])).filter(Boolean);
  const floor = floors.length ? [...new Set(floors)].join(', ') : null;
  return {
    name: a.name,
    type: a.type,
    cuisine: a.cuisine ?? b.cuisine,
    floor,
    inFoodcourt: a.inFoodcourt === true || b.inFoodcourt === true ? true : (a.inFoodcourt ?? b.inFoodcourt),
    yandexUrl: a.yandexUrl ?? b.yandexUrl,
    note: a.note ?? b.note,
  };
}

/** retail_info.food → RetailFoodInfo; ни итога, ни зон, ни заведений — null. */
function foodInfoOf(value: unknown): RetailFoodInfo | null {
  const r = record(value);
  if (!r) return null;
  const summary = str(r.summary);
  const zones: RetailFoodZone[] = records(r.zones).flatMap((z) => {
    const name = str(z.name);
    if (!name) return [];
    return [
      {
        name,
        floor: text(z.floor),
        area: text(z.area),
        seats: text(z.seats),
        points: text(z.points),
        hours: str(z.hours),
        text: str(z.text),
        ...sourceOf(z),
      },
    ];
  });
  const byKey = new Map<string, RetailFoodPlace>();
  for (const p of records(r.places)) {
    const name = str(p.name);
    if (!name) continue;
    const type = str(p.type);
    const place: RetailFoodPlace = {
      name,
      type: (type && FOOD_PLACE_TYPE_SET.has(type) ? type : 'cafe') as RetailFoodPlaceType,
      cuisine: str(p.cuisine),
      floor: text(p.floor),
      inFoodcourt: bool(p.inFoodcourt),
      yandexUrl: httpUrl(p.yandexUrl),
      note: str(p.note),
    };
    const key = placeKey(name);
    const prev = byKey.get(key);
    byKey.set(key, prev ? mergePlace(prev, place) : place);
  }
  const places = [...byKey.values()];
  if (!summary && !zones.length && !places.length) return null;
  return { summary, zones, places };
}

function funEntriesOf(value: unknown): RetailFunEntry[] {
  return records(value).flatMap((r) => {
    const name = str(r.name);
    if (!name) return [];
    const kind = str(r.kind);
    return [
      {
        name,
        kind: (kind && FUN_KIND_SET.has(kind) ? kind : 'other') as RetailFunKind,
        floor: text(r.floor),
        area: text(r.area),
        capacity: text(r.capacity),
        formats: [...new Set(strings(r.formats))],
        hours: str(r.hours),
        since: text(r.since),
        text: str(r.text),
        yandexUrl: httpUrl(r.yandexUrl),
        ...sourceOf(r),
      },
    ];
  });
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
  const { anchors, timeline } = anchorsAndTimeline(data);
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
  const food = foodInfoOf(data.food);
  const fun = funEntriesOf(data.fun);
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
    if (!name) return [];
    const rawGroup = str(r.group);
    const group =
      rawGroup && SERVICE_GROUP_SET.has(rawGroup) ? (rawGroup as RetailServiceGroup) : serviceGroupFromName(name);
    return [{ name, text: str(r.text), floor: text(r.floor), group, ...sourceOf(r) }];
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

  const vacancies: RetailVacancyEntry[] = records(data.vacancies).flatMap((r) => {
    const size = num(r.size);
    const deal = str(r.deal);
    if (size == null || size <= 0 || (deal !== 'rent' && deal !== 'sale')) return [];
    const price = num(r.pricePerSqm);
    return [
      {
        deal,
        type: str(r.type),
        size,
        floor: text(r.floor),
        pricePerSqm: price != null && price > 0 ? price : null,
        note: str(r.note),
        checkedAt: str(r.checkedAt),
        ...sourceOf(r),
      },
    ];
  });

  const tenantsAtRaw = record(data.tenantsAt);
  const tenantsAtSlug = tenantsAtRaw ? str(tenantsAtRaw.slug) : null;
  const tenantsAtName = tenantsAtRaw ? str(tenantsAtRaw.name) : null;
  const tenantsAt = tenantsAtSlug && tenantsAtName ? { slug: tenantsAtSlug, name: tenantsAtName } : null;

  const info: RetailInfo = {
    floorsGuide,
    anchors,
    timeline,
    leisure,
    food,
    fun,
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
    vacancies,
    tenantsAt,
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

// Сетка 4 награды / 3 рейтинга на широком экране — владелец, 2026-09-25.
export function awardsRankingSize(info: RetailInfo | null, legacyAwardLines = 0): number {
  const awards = info?.awards.length ? Math.ceil(info.awards.length / 4) * 3 : Math.ceil(legacyAwardLines / 4);
  const ranking = Math.ceil((info?.ranking.length ?? 0) / 3) * 2;
  return awards + ranking;
}

// --- Якоря и история ритейла (2026-09-24) ------------------------------
// Два блока вместо старой карточки «Первые в Беларуси и якоря»: «Якорные
// арендаторы» (перед каталогом арендаторов) и «Чем ТЦ вошёл в историю
// ритейла» — только достижения, без уходов и закрытий.

/** Подпись категории якоря; у «другое» подписи нет — остаётся только иконка. */
export const ANCHOR_CATEGORY_LABELS: Record<RetailAnchorCategory, string | null> = {
  гипермаркет: 'Гипермаркет',
  кинотеатр: 'Кинотеатр',
  fashion: 'Одежда и обувь',
  электроника: 'Электроника',
  'детские товары': 'Детские товары',
  спорт: 'Спорт',
  'дом и интерьер': 'Дом и интерьер',
  развлечения: 'Развлечения',
  фудкорт: 'Фудкорт',
  фитнес: 'Фитнес',
  другое: null,
};

export function anchorCategoryLabel(anchor: RetailAnchorEntry): string | null {
  return anchor.category ? ANCHOR_CATEGORY_LABELS[anchor.category] : null;
}

/** "6300" → "6 300 м²"; строка с единицами («6 300 м²», «около 2 000 м²») — как есть. */
export function formatAnchorArea(area: string): string {
  const digits = area.replace(/\s/g, '');
  return /^\d+$/.test(digits) ? `${Number(digits).toLocaleString('ru-RU')}\u00a0м²` : area;
}

/** "2016" → "с 2016 года"; иначе как записал ресёрч, с «с». */
export function formatAnchorSince(since: string): string {
  return /^\d{4}$/.test(since) ? `с ${since} года` : `с ${since}`;
}

/** Части строки «этаж · площадь · с года» — только известные. */
export function anchorMetaParts(anchor: RetailAnchorEntry): string[] {
  return [
    anchor.floor ? formatFloorLabel(anchor.floor) : null,
    anchor.area ? formatAnchorArea(anchor.area) : null,
    anchor.since ? formatAnchorSince(anchor.since) : null,
  ].filter((part): part is string => Boolean(part));
}

export const TIMELINE_KIND_LABELS: Record<RetailTimelineKind, string> = {
  // «Впервые» без страны: у части записей «впервые в Минске», география — в тексте.
  first: 'Впервые',
  first_format: 'Первый формат',
  record: 'Рекорд',
  milestone: 'Событие',
};

function timelineSortKey(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return y * 10000 + (m || 0) * 100 + (d || 0);
}

/** По возрастанию даты; год без месяца — раньше месяцев того же года. */
export function sortTimeline(entries: RetailTimelineEntry[]): RetailTimelineEntry[] {
  return [...entries].sort((a, b) => timelineSortKey(a.date) - timelineSortKey(b.date));
}

/** Год крупно слева на ленте. */
export function timelineYear(entry: RetailTimelineEntry): string {
  return entry.date.slice(0, 4);
}

/** Месяц под годом («март»); у записи только с годом — null. */
export function timelineMonth(entry: RetailTimelineEntry): string | null {
  const month = Number(entry.date.split('-')[1]);
  return month >= 1 && month <= 12 ? MONTHS_NOM[month - 1] : null;
}

/** Сколько строк ленты видно до «Показать всё». */
export const TIMELINE_COLLAPSED = 12;

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

/**
 * «Какие якорные арендаторы в …?» — по строке на якорь, в порядке блока:
 * «Гиппо — гипермаркет (−1 этаж, 6 300 м², с 2016 года). Текст.»
 */
export function anchorsFaqAnswer(anchors: RetailAnchorEntry[]): string | null {
  if (!anchors.length) return null;
  return anchors
    .map((a) => {
      const category = anchorCategoryLabel(a);
      const meta = anchorMetaParts(a);
      const head = `${a.name}${category ? ` — ${category.toLowerCase()}` : ''}${meta.length ? ` (${meta.join(', ')})` : ''}`;
      return a.text ? `${sentence(head)} ${sentence(upperFirst(a.text))}` : sentence(head);
    })
    .join('\n');
}

/**
 * «Чем … вошёл в историю ритейла Беларуси?» — вся лента по возрастанию
 * даты: «Апрель 2017 — New Balance: первый в Беларуси концепт-магазин.»
 */
export function retailHistoryFaqAnswer(timeline: RetailTimelineEntry[]): string | null {
  if (!timeline.length) return null;
  return sortTimeline(timeline)
    .map((t) => {
      const when = upperFirst(formatRetailDate(t.date) ?? timelineYear(t));
      const line = sentence(`${when} — ${t.name}${t.text ? `: ${t.text}` : ''}`);
      return t.note ? `${line} ${sentence(upperFirst(t.note))}` : line;
    })
    .join('\n');
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

// --- Еда и развлечения (2026-09-24) ---------------------------------------
// Владелец разделил «Кино, еда, развлечения» (leisure) на два блока: «Где
// поесть» (retail_info.food — зоны вроде фудкорта и ВСЕ заведения) и
// «Развлечения» (retail_info.fun). У ТЦ, где есть хоть один из новых
// ключей, leisure не рисуется, а из «Якорных арендаторов» уходят кинотеатр,
// фудкорт, развлечения и фитнес — они уже описаны в новых блоках.

export function hasFoodFun(info: RetailInfo | null): boolean {
  return Boolean(info && (info.food || info.fun.length));
}

/** Старый блок досуга — только у ТЦ без новых блоков «Где поесть»/«Развлечения». */
export function leisureForPage(info: RetailInfo | null): RetailLeisureEntry[] {
  return !info || hasFoodFun(info) ? [] : info.leisure;
}

const FOOD_FUN_ANCHOR_CATEGORIES = new Set<RetailAnchorCategory>(['кинотеатр', 'фудкорт', 'развлечения', 'фитнес']);

/**
 * Якоря, которые показывает страница: при новых блоках еды и развлечений
 * кинотеатр, фудкорт, развлечения и фитнес в якорях были бы дублем.
 * Данные в базе чистятся отдельно — это страховка на фронте.
 */
export function anchorsForPage(info: RetailInfo | null): RetailAnchorEntry[] {
  if (!info) return [];
  if (!hasFoodFun(info)) return info.anchors;
  return info.anchors.filter((a) => !a.category || !FOOD_FUN_ANCHOR_CATEGORIES.has(a.category));
}

export const FOOD_PLACE_TYPE_LABELS: Record<RetailFoodPlaceType, string> = {
  restaurant: 'Рестораны',
  cafe: 'Кафе',
  fastfood: 'Фастфуд',
  coffee: 'Кофейни',
  dessert: 'Десерты и выпечка',
  bar: 'Бары',
};

/** Число заведений типа словами для FAQ: «8 ресторанов», «6 точек фастфуда». */
const FOOD_PLACE_TYPE_COUNT: Record<RetailFoodPlaceType, [string, string, string]> = {
  restaurant: ['ресторан', 'ресторана', 'ресторанов'],
  cafe: ['кафе', 'кафе', 'кафе'],
  fastfood: ['точка фастфуда', 'точки фастфуда', 'точек фастфуда'],
  coffee: ['кофейня', 'кофейни', 'кофеен'],
  dessert: ['кондитерская', 'кондитерские', 'кондитерских'],
  bar: ['бар', 'бара', 'баров'],
};

export interface FoodPlaceGroup {
  type: RetailFoodPlaceType;
  label: string;
  places: RetailFoodPlace[];
}

/**
 * Заведения по типам в порядке блока (рестораны → кафе → фастфуд →
 * кофейни → десерты → бары), внутри типа — по алфавиту: в списке из
 * 60 названий так ищут глазами.
 */
export function groupFoodPlaces(places: RetailFoodPlace[]): FoodPlaceGroup[] {
  return RETAIL_FOOD_PLACE_TYPES.flatMap((type) => {
    const group = places.filter((p) => p.type === type).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return group.length ? [{ type, label: FOOD_PLACE_TYPE_LABELS[type], places: group }] : [];
  });
}

/** Сколько заведений видно до «Показать все» — не меньше этого. */
export const FOOD_PLACES_COLLAPSED = 15;

/** Ряд списка на десктопе: заведения стоят по три. */
const FOOD_PLACES_ROW = 3;

/**
 * Сколько заведений каждой группы видно в свёрнутом списке. Места
 * раздаются по кругу целыми рядами (по три — столько в ряду на десктопе),
 * пока видимых не станет FOOD_PLACES_COLLAPSED: так в свёрнутом виде видна
 * каждая группа, а не одни рестораны, и ряды не обрываются на середине.
 * Если прятать пришлось бы три заведения или меньше, список виден целиком:
 * кнопка ради пары строк хуже, чем сами строки.
 */
export function foodPlacesVisibleCounts(groups: FoodPlaceGroup[], limit = FOOD_PLACES_COLLAPSED): number[] {
  const full = groups.map((g) => g.places.length);
  const total = full.reduce((sum, n) => sum + n, 0);
  const counts = groups.map(() => 0);
  let shown = 0;
  while (shown < limit && shown < total) {
    groups.forEach((g, i) => {
      const next = Math.min(g.places.length, counts[i] + FOOD_PLACES_ROW);
      shown += next - counts[i];
      counts[i] = next;
    });
  }
  return total - shown <= 3 ? full : counts;
}

/** Есть ли что прятать за «Показать все». */
export function foodPlacesCollapsible(groups: FoodPlaceGroup[]): boolean {
  const total = groups.reduce((sum, g) => sum + g.places.length, 0);
  return foodPlacesVisibleCounts(groups).reduce((sum, n) => sum + n, 0) < total;
}

/** "3" → "эт. 3", "-1" → "эт. −1", "1, 3" → "эт. 1, 3". */
export function formatFoodFloor(floor: string): string {
  return `эт.\u00a0${formatFloorBadge(floor)}`;
}

/** "1200" → "1 200"; строка со словами — как есть. */
function formatCount(value: string): string {
  const digits = value.replace(/\s/g, '');
  return /^\d+$/.test(digits) ? Number(digits).toLocaleString('ru-RU') : value;
}

function countOf(value: string): number | null {
  const digits = value.replace(/\s/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

/** Метрика зоны: крупное значение и подпись под ним. */
export interface FoodZoneMetric {
  value: string;
  label: string;
}

/** «1 200 м² площадь», «600 мест», «18 точек питания» — только известные. */
export function foodZoneMetrics(zone: RetailFoodZone): FoodZoneMetric[] {
  const metrics: FoodZoneMetric[] = [];
  if (zone.area) metrics.push({ value: formatAnchorArea(zone.area), label: 'площадь' });
  if (zone.seats) {
    const n = countOf(zone.seats);
    metrics.push({ value: formatCount(zone.seats), label: n != null ? pluralRu(n, 'место', 'места', 'мест') : 'мест' });
  }
  if (zone.points) {
    const n = countOf(zone.points);
    metrics.push({
      value: formatCount(zone.points),
      label: n != null ? pluralRu(n, 'точка питания', 'точки питания', 'точек питания') : 'точек питания',
    });
  }
  return metrics;
}

export const FUN_KIND_LABELS: Record<RetailFunKind, string> = {
  cinema: 'Кинотеатр',
  ice: 'Каток',
  kids: 'Детям',
  concert: 'Концерты',
  games: 'Игры',
  quest: 'Квесты',
  sport: 'Спорт',
  fitness: 'Фитнес',
  other: 'Развлечения',
};

/** Кинотеатр первым, дальше — порядок схемы (каток, детям, концерты, …). */
export function sortFun(fun: RetailFunEntry[]): RetailFunEntry[] {
  return [...fun].sort((a, b) => RETAIL_FUN_KINDS.indexOf(a.kind) - RETAIL_FUN_KINDS.indexOf(b.kind));
}

/** "500" → "500 мест" у кино и концертов, «до 200 человек» у остальных. */
export function formatFunCapacity(entry: RetailFunEntry): string | null {
  if (!entry.capacity) return null;
  const n = countOf(entry.capacity);
  if (n == null) return entry.capacity;
  const value = formatCount(entry.capacity);
  return entry.kind === 'cinema' || entry.kind === 'concert'
    ? `${value}\u00a0${pluralRu(n, 'место', 'места', 'мест')}`
    : `до\u00a0${value}\u00a0${pluralRu(n, 'человека', 'человек', 'человек')}`;
}

/** Части строки «этаж · площадь · вместимость · с 2016» — только известные. */
export function funMetaParts(entry: RetailFunEntry): string[] {
  return [
    entry.floor ? formatFunFloor(entry.floor) : null,
    entry.area ? formatAnchorArea(entry.area) : null,
    formatFunCapacity(entry),
    entry.since ? formatFunSince(entry.since) : null,
  ].filter((part): part is string => Boolean(part));
}

// «4-й уровень паркинга» — место словами, к нему «этаж» не приписываем.
function formatFunFloor(floor: string): string {
  return /[а-яё]{3,}/iu.test(floor) ? floor : formatFloorLabel(floor);
}

// Ресёрч пишет дату открытия как есть («2017-08-11», «2025-10»); в строке
// метрик достаточно года.
function formatFunSince(since: string): string {
  if (/^с\s/i.test(since)) return since;
  const iso = since.match(/^(\d{4})-\d{2}(?:-\d{2})?$/);
  return `с\u00a0${iso ? iso[1] : since}`;
}

/**
 * «Где поесть в …?» — итог, по строке на зону (этаж, площадь, места,
 * точки, часы), потом число заведений по типам и до восьми названий
 * ресторанов и кафе — тех же, что в списке блока.
 */
export function foodFaqAnswer(food: RetailFoodInfo | null): string | null {
  if (!food) return null;
  const lines: string[] = [];
  if (food.summary) lines.push(sentence(food.summary));
  for (const zone of food.zones) {
    const parts = [
      zone.floor ? formatFloorLabel(zone.floor) : null,
      ...foodZoneMetrics(zone).map((m) => (m.label === 'площадь' ? m.value : `${m.value} ${m.label}`)),
      zone.hours ? `работает ${zone.hours}` : null,
    ].filter(Boolean);
    const head = sentence(`${zone.name}${parts.length ? ` — ${parts.join(', ')}` : ''}`);
    lines.push(zone.text ? `${head} ${sentence(upperFirst(zone.text))}` : head);
  }
  const groups = groupFoodPlaces(food.places);
  if (groups.length) {
    const total = food.places.length;
    const counts = groups
      .map((g) => {
        const [one, few, many] = FOOD_PLACE_TYPE_COUNT[g.type];
        return `${g.places.length} ${pluralRu(g.places.length, one, few, many)}`;
      })
      .join(', ');
    lines.push(`Всего ${total} ${pluralRu(total, 'заведение', 'заведения', 'заведений')}: ${counts}.`);
    const dining = groups.filter((g) => g.type === 'restaurant' || g.type === 'cafe');
    const pool = (dining.length ? dining : groups).flatMap((g) => g.places.map((p) => p.name));
    const label = dining.length ? dining.map((g) => g.label.toLowerCase()).join(' и ') : 'заведения';
    const names = pool.slice(0, 8);
    lines.push(`${upperFirst(label)}: ${names.join(', ')}${pool.length > names.length ? ' и другие' : ''}.`);
  }
  return lines.length ? lines.join('\n') : null;
}

/** Вид площадки существительным для FAQ: «— детский центр», а не «— детям». */
const FUN_KIND_NOUNS: Record<RetailFunKind, string | null> = {
  cinema: 'кинотеатр',
  ice: 'каток',
  kids: 'детский центр',
  concert: 'концертная площадка',
  games: 'игровой центр',
  quest: 'квесты',
  sport: 'спортивная площадка',
  fitness: 'фитнес-клуб',
  other: null,
};

/**
 * «Какие развлечения есть в …?» — по строке на запись в порядке блока:
 * «Silver Screen — кинотеатр (3 этаж, 1 500 мест, с 2016). Форматы: IMAX,
 * 4DX. Режим работы: 10:00–02:00. Текст.»
 */
export function funFaqAnswer(fun: RetailFunEntry[]): string | null {
  if (!fun.length) return null;
  return sortFun(fun)
    .map((f) => {
      const noun = FUN_KIND_NOUNS[f.kind];
      // «Кинотеатр Silver Screen — кинотеатр» — повтор; вид пишем, только если его нет в имени.
      const showKind = noun && !f.name.toLowerCase().includes(noun.slice(0, 5));
      const meta = funMetaParts(f);
      const head = `${f.name}${showKind ? ` — ${noun}` : ''}${meta.length ? ` (${meta.join(', ')})` : ''}`;
      // У кино и концертов это форматы залов (IMAX, 4DX), у остальных — услуги.
      const formatsLabel = f.kind === 'cinema' || f.kind === 'concert' ? 'Форматы' : 'Что есть';
      return [
        sentence(head),
        f.formats.length ? sentence(`${formatsLabel}: ${f.formats.join(', ')}`) : null,
        f.hours ? sentence(`Режим работы: ${f.hours}`) : null,
        f.text ? sentence(upperFirst(f.text)) : null,
      ]
        .filter(Boolean)
        .join(' ');
    })
    .join('\n');
}

/**
 * FAQ к списку «Свободно по данным ТЦ» (retail_info.vacancies): те же
 * помещения, что в блоке, — площадь, этаж, тип, цена или «по запросу».
 */
export function vacanciesFaqAnswer(vacancies: RetailVacancyEntry[]): string | null {
  if (!vacancies.length) return null;
  const area = (n: number) => `${(n >= 1000 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('ru-RU')} м²`;
  const lines = [...vacancies]
    .sort((a, b) => a.size - b.size)
    .map((v) => {
      const floor = v.floor ? (/^[-−]?\d+$/.test(v.floor) ? `${v.floor.replace('-', '−')} этаж` : v.floor) : null;
      const price =
        v.pricePerSqm != null
          ? `$${(Math.round(v.pricePerSqm * 10) / 10).toLocaleString('ru-RU')} за м²${v.deal === 'rent' ? ' в месяц' : ''}`
          : 'цена по запросу';
      return `${area(v.size)}${[floor, v.type].filter(Boolean).length ? ` (${[floor, v.type].filter(Boolean).join(', ')})` : ''} — ${price}`;
    });
  const one = lines.length % 10 === 1 && lines.length % 100 !== 11;
  const deal = vacancies.every((v) => v.deal === 'sale')
    ? one ? 'продаётся' : 'продаются'
    : one ? 'сдаётся' : 'сдаются';
  const rooms = `${lines.length} ${pluralRu(lines.length, 'помещение', 'помещения', 'помещений')}`;
  return `По списку самого ТЦ ${deal} ${rooms}: ${lines.join('; ')}.`;
}

/** Заголовки карточек: `name` — «ТЦ «Замок»». */
export function foodTitle(name: string): string {
  return `Где поесть в ${name}`;
}

export function funTitle(name: string): string {
  return `Развлечения в ${name}`;
}

/**
 * Размер «Где поесть» для модели высот (единица ~43px, см.
 * businessCenterPageLayout): итог — единица, ряд плашек зон по две —
 * четыре, у каждой группы заведений заголовок — единица и по единице на
 * ряд из трёх в СВЁРНУТОМ виде, кнопка «Показать все» — единица. Замер
 * 2026-09-24 на 1280px (мок Galleria Minsk: 2 зоны, 44 заведения в шести
 * группах, 18 единиц) — 975px свёрнутый, 1452px раскрытый.
 */
export function foodSectionSize(food: RetailFoodInfo | null): number {
  if (!food) return 0;
  const groups = groupFoodPlaces(food.places);
  const visible = foodPlacesVisibleCounts(groups);
  const placeRows = visible.reduce((sum, n) => sum + (n ? 1 + Math.ceil(n / 3) : 0), 0);
  return (
    (food.summary ? 1 : 0) +
    Math.ceil(food.zones.length / 2) * 4 +
    placeRows +
    (foodPlacesCollapsible(groups) ? 1 : 0)
  );
}

/** Размер «Развлечений»: кинотеатр — отдельный ряд во всю ширину, остальные по две. */
export function funSectionSize(fun: RetailFunEntry[]): number {
  const cinema = fun.filter((f) => f.kind === 'cinema').length;
  return cinema + Math.ceil((fun.length - cinema) / 2);
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
  return floor ? formatFunFloor(floor) : null;
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

/** «Посещаемость — 40 000 человек в день (2025, по данным ТЦ).» */
export function formatFigureLine(entry: RetailFigureEntry): string {
  const meta = [formatRetailDate(entry.date), entry.note].filter(Boolean).join(', ');
  const line = sentence(`${entry.label} — ${entry.value}${meta ? ` (${meta})` : ''}`);
  return entry.text ? `${line} ${sentence(upperFirst(entry.text))}` : line;
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

// Два раздела вместо «Посетителю», без скрытых часов и правил (владелец, 2026-09-25).
export type RetailSectionId =
  | 'floors'
  | 'retail-history'
  | 'food'
  | 'fun'
  | 'leisure'
  | 'getting-here'
  | 'offers-events'
  | 'advertising'
  | 'numbers'
  | 'quotes'
  | 'anchors';

export const RETAIL_SECTION_LABELS: Record<RetailSectionId, string> = {
  // «Что на каком этаже» и «Каталог арендаторов» слиты в один блок
  // (владелец, 2026-09-25) — TradeCenterGuide.tsx.
  floors: 'Что где',
  // Заголовок карточки длиннее — «Чем ТЦ «…» вошёл в историю ритейла»
  // (retailHistoryTitle), это подпись пункта меню.
  'retail-history': 'В истории ритейла',
  // Заголовки карточек длиннее — «Где поесть в ТЦ «…»» (foodTitle,
  // funTitle), здесь — подписи пунктов меню.
  food: 'Где поесть',
  fun: 'Развлечения',
  leisure: 'Кино, еда, развлечения',
  'getting-here': 'Как добраться',
  'offers-events': 'Скидки и события',
  advertising: 'Реклама в ТЦ',
  numbers: 'ТЦ в цифрах',
  quotes: 'Цитаты',
  anchors: 'Якорные арендаторы',
};

/** Заголовок карточки ленты: `name` — «ТЦ «Замок»». */
export function retailHistoryTitle(name: string): string {
  return `Чем ${name} вошёл в историю ритейла`;
}

/**
 * Группы карточек, которые читаются подряд: «для посетителя» и «для
 * бизнеса». Рекомендацию между карточками одной группы страница переносит
 * за последнюю карточку группы, а на стыке групп — оставляет. «Якорные
 * арендаторы» — своя группа: они стоят вплотную к каталогу арендаторов, и
 * рекомендацию после них страница переносит за каталог.
 */
export function retailSectionGroup(id: RetailSectionId): 'visitor' | 'business' | 'tenants' {
  if (id === 'anchors') return 'tenants';
  return id === 'advertising' || id === 'numbers' || id === 'quotes' ? 'business' : 'visitor';
}

export function hasAdvertisingInfo(info: RetailInfo): boolean {
  return Boolean(info.audience.length || info.advertising);
}

// Высота учитывает только видимые карточки (владелец, 2026-09-25).
export function retailSectionSize(info: RetailInfo | null, id: RetailSectionId, tenantsCount = 0): number {
  // Поиск заменил полный список: высота не растёт с числом арендаторов (владелец, 2026-09-25).
  if (id === 'floors') return (info?.floorsGuide.length ?? 0) * 2 + (tenantsCount > 0 ? 6 : 0);
  if (!info) return 0;
  switch (id) {
    // Строка ленты; свёрнутая лента показывает не больше TIMELINE_COLLAPSED.
    case 'retail-history':
      return Math.min(info.timeline.length, TIMELINE_COLLAPSED);
    // Плитки якорей по три в ряд на десктопе.
    case 'anchors':
      return Math.ceil(anchorsForPage(info).length / 3);
    case 'food':
      return foodSectionSize(info.food);
    case 'fun':
      return funSectionSize(info.fun);
    // Плитки в две колонки: высоту задаёт число рядов.
    case 'leisure':
      return Math.ceil(leisureForPage(info).length / 2);
    case 'getting-here': {
      const transport = transportForVisit(info.transport);
      const parking = parkingForVisit(info.parking, info.hours);
      return Math.max(Number(transport.metro.length > 0) + transport.routes.length + transport.transfers.length,
        parking ? Number(parking.tiles.length > 0) * 2 + parking.free.length + Number(Boolean(parking.charging)) + 1 : 0);
    }
    case 'offers-events':
      return info.loyalty.length * 3 + Math.ceil(eventsForVisit(info.events).length / 3) * 3;
    case 'advertising':
      return Math.ceil(info.audience.length / 5) * 3 + Math.ceil((info.advertising?.points.length ?? 0) / 3) * 3 + Number(Boolean(info.advertising?.contacts)) * 3;
    case 'numbers':
      // Учитываем новые группы в высоте блока (владелец, 2026-09-25).
      return groupNumbers(info.numbers).reduce((rows, group) => rows + Number(Boolean(group.label)) + Math.ceil(group.entries.length / (group.kind === 'scale' ? 2 : group.kind === 'holidays' ? 3 : 5)), 0);
    // Цитаты в две колонки.
    case 'quotes':
      return Math.ceil(info.quotes.length / 2);
  }
}

/**
 * Какие карточки реально нарисуются — в порядке на странице.
 *
 * `hasTenants` (владелец, 2026-09-25): «Путеводитель по ТЦ» (id 'floors')
 * теперь несёт и каталог арендаторов, поэтому рисуется и без floorsGuide,
 * если есть хоть один арендатор — иначе у ТЦ без текстового гида, но с
 * собранным каталогом (Яндекс), карточка и пункт меню молча пропадали бы.
 */
export function retailSectionIds(info: RetailInfo | null, hasTenants = false): RetailSectionId[] {
  if (!info) return hasTenants ? ['floors'] : [];
  const ids: RetailSectionId[] = [];
  if (info.floorsGuide.length || hasTenants) ids.push('floors');
  if (info.timeline.length) ids.push('retail-history');
  if (info.food) ids.push('food');
  if (info.fun.length) ids.push('fun');
  // Старый досуг — только пока нет новых блоков (leisureForPage).
  if (leisureForPage(info).length) ids.push('leisure');
  if (hasGettingHereInfo(info)) ids.push('getting-here');
  if (hasOffersEventsInfo(info)) ids.push('offers-events');
  if (hasAdvertisingInfo(info)) ids.push('advertising');
  if (info.numbers.length) ids.push('numbers');
  if (info.quotes.length) ids.push('quotes');
  // Последними — вплотную к каталогу арендаторов, который идёт за ними.
  if (anchorsForPage(info).length) ids.push('anchors');
  return ids;
}
