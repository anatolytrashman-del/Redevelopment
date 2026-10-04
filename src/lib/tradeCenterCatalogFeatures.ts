// Фильтры каталога ТЦ, которым не хватает колонок списка (владелец,
// 2026-09-30): «Магазин в ТЦ», «Что внутри», «Парковка», «Когда». Всё это
// лежит в retail_info и в снимке арендаторов Яндекса — тяжёлых полях,
// которых в /data/trade-centers.json нет. Сборка кладёт их выжимку в
// /data/tc-filters.json (scripts/generate-catalog-data.mjs, writeTcFilters),
// а смысл признаков считается здесь, чтобы правило жило в одном месте и
// проверялось тестом, а не дублировалось в JS сборки.
import { pluralRu } from './pluralRu';
import { minskNowMinutes, parseDailyHours, pickMainHoursZone, type ParsedDailyHours } from './tradeCenterHero';

/** Одна запись /data/tc-filters.json — сырые куски retail_info и арендаторов. */
export interface TcFilterSource {
  funKinds: string[];
  foodZones: number;
  foodcourtPlaces: number;
  anchorCategories: string[];
  parking: { summary: string; items: { label: string; value: string }[] } | null;
  hours: { zone: string; value: string }[];
  brands: string[];
}

export interface TcFilterEntry {
  features: Set<string>;
  hours: ParsedDailyHours;
  // Нормализованные названия арендаторов для поиска «Магазин в ТЦ».
  brands: string[];
  // Те же названия как у Яндекса — для подсказок под полем.
  brandNames: string[];
}

export type TcFilterIndex = Map<string, TcFilterEntry>;

export const TC_FEATURE_GROUPS: { label: string; options: { id: string; label: string }[] }[] = [
  {
    label: 'Что внутри',
    options: [
      { id: 'cinema', label: 'кинотеатр' },
      { id: 'foodcourt', label: 'фудкорт' },
      { id: 'kids', label: 'детям' },
      { id: 'fitness', label: 'фитнес и спорт' },
      { id: 'grocery', label: 'продукты' },
    ],
  },
  {
    label: 'Парковка',
    options: [
      { id: 'park-free', label: 'бесплатная' },
      { id: 'park-covered', label: 'крытая' },
      { id: 'ev', label: 'электрозарядка' },
    ],
  },
  {
    label: 'Когда',
    options: [
      { id: 'open-now', label: 'открыто сейчас' },
      { id: 'late', label: 'после 22:00' },
    ],
  },
];

export const TC_FEATURE_IDS = new Set(TC_FEATURE_GROUPS.flatMap((g) => g.options.map((o) => o.id)));

// Кириллица и \b несовместимы (CLAUDE.md) — начало слова через lookbehind.
// «открытая» содержит «крыт», поэтому крытая парковка — только с начала слова.
const COVERED_RE = /(?<![\p{L}])крыт|подземн|многоуровн|многоэтажн/iu;
const EV_RE = /электрозаряд|зарядк|зарядн|электромобил/iu;
const FREE_RE = /(?<![\p{L}])бесплатн/iu;
// «бесплатного периода нет», «без бесплатного» — это про платную парковку.
const NOT_FREE_RE = /(?:нет|без)\s+бесплатн|бесплатн\p{L}*\s+(?:период\p{L}*\s+)?нет/iu;

function parkingFeatures(parking: TcFilterSource['parking']): string[] {
  if (!parking) return [];
  const parts = [parking.summary, ...parking.items.map((i) => `${i.label}: ${i.value}`)];
  const out: string[] = [];
  if (parts.some((p) => FREE_RE.test(p) && !NOT_FREE_RE.test(p))) out.push('park-free');
  if (parts.some((p) => COVERED_RE.test(p))) out.push('park-covered');
  if (parts.some((p) => EV_RE.test(p))) out.push('ev');
  return out;
}

export function normalizeBrand(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Развлечения для подборки /with/entertainment — не только кино/дети/фитнес. */
export const TC_ENTERTAINMENT_FUN_KINDS = ['cinema', 'games', 'ice', 'quest', 'concert', 'other'] as const;

export function buildTcFilterEntry(src: TcFilterSource): TcFilterEntry {
  const features = new Set<string>();
  if (src.funKinds.includes('cinema')) features.add('cinema');
  if (src.funKinds.includes('kids')) features.add('kids');
  if (src.funKinds.includes('ice')) features.add('ice');
  if (src.funKinds.some((k) => k === 'fitness' || k === 'sport')) features.add('fitness');
  if (src.foodZones > 0 || src.foodcourtPlaces > 0) features.add('foodcourt');
  if (src.anchorCategories.includes('гипермаркет')) features.add('grocery');
  if (src.funKinds.some((k) => (TC_ENTERTAINMENT_FUN_KINDS as readonly string[]).includes(k))) {
    features.add('entertainment');
  }
  // Есть описание парковки — для подборки /with/parking (не чип фильтра).
  if (src.parking) features.add('parking');
  for (const f of parkingFeatures(src.parking)) features.add(f);
  const main = pickMainHoursZone(src.hours.map((h) => ({ ...h, note: null, source: null, sourceUrl: null })));
  const hours = main ? parseDailyHours(main.value) : null;
  if (hours === 'always' || (hours && closesAtOrAfter(hours, 22 * 60))) features.add('late');
  const byKey = new Map<string, string>();
  for (const name of src.brands) {
    const key = normalizeBrand(name);
    if (key && !byKey.has(key)) byKey.set(key, name.trim());
  }
  return { features, hours, brands: [...byKey.keys()], brandNames: [...byKey.values()] };
}

function closesAtOrAfter(hours: { openMin: number; closeMin: number }, minute: number): boolean {
  // Закрытие после полуночи (10:00–02:00) — это «позже 22:00», а не «в 2 ночи».
  const close = hours.closeMin > hours.openMin ? hours.closeMin : hours.closeMin + 24 * 60;
  return close >= minute;
}

export function isOpenAt(hours: ParsedDailyHours, nowMin: number): boolean {
  if (hours === null) return false;
  if (hours === 'always') return true;
  const { openMin, closeMin } = hours;
  return closeMin <= openMin ? nowMin >= openMin || nowMin < closeMin : nowMin >= openMin && nowMin < closeMin;
}

export function buildTcFilterIndex(raw: Record<string, TcFilterSource>): TcFilterIndex {
  return new Map(Object.entries(raw).map(([slug, src]) => [slug, buildTcFilterEntry(src)]));
}

/**
 * Подходит ли ТЦ под выбранные признаки и строку «Магазин в ТЦ». ТЦ, по
 * которому выжимки нет, под любой признак не подходит: «не знаем» не
 * выдаём за «есть».
 */
export function matchesTcFeatures(
  entry: TcFilterEntry | undefined,
  features: string[],
  store: string,
  nowMin: number = minskNowMinutes(),
): boolean {
  const q = normalizeBrand(store);
  if (features.length === 0 && !q) return true;
  if (!entry) return false;
  for (const id of features) {
    if (id === 'open-now') {
      if (!isOpenAt(entry.hours, nowMin)) return false;
    } else if (!entry.features.has(id)) return false;
  }
  if (q && !entry.brands.some((b) => b.includes(q))) return false;
  return true;
}

/** Подсказки под полем «Магазин в ТЦ»: точное совпадение, потом начинающиеся с запроса (короче — выше), потом содержащие его. */
export function brandSuggestions(index: TcFilterIndex, query: string, limit = 6): string[] {
  const q = normalizeBrand(query);
  if (q.length < 2) return [];
  const counts = new Map<string, { name: string; n: number }>();
  for (const entry of index.values()) {
    entry.brands.forEach((key, i) => {
      if (!key.includes(q)) return;
      const hit = counts.get(key);
      if (hit) hit.n += 1;
      else counts.set(key, { name: entry.brandNames[i], n: 1 });
    });
  }
  return Array.from(counts.entries())
    .sort((a, b) => Number(a[0] !== q) - Number(b[0] !== q) || Number(!a[0].startsWith(q)) - Number(!b[0].startsWith(q)) || a[0].length - b[0].length || b[1].n - a[1].n || a[0].localeCompare(b[0], 'ru'))
    .slice(0, limit)
    .map(([, v]) => v.name);
}

// Формат одной строкой (владелец, 2026-09-30): деление ТРЦ / ТЦ / районный /
// универмаг / гипермаркет покупателю ничего не говорит — это один чип
// «торговый центр», а разница (кино, фудкорт, продукты) видна по «Что
// внутри». Отдельно — только места другого назначения. Значения — как в
// колонке retail_format; незнакомый формат из админки уходит в общий чип.
const TC_SPECIAL_FORMAT_CHIPS: { label: string; values: string[] }[] = [
  { label: 'мебель', values: ['мебельный центр'] },
  { label: 'рынки', values: ['рынок'] },
  { label: 'стройка и авто', values: ['строительный центр', 'автоцентр'] },
  { label: 'аутлет', values: ['аутлет'] },
];

/** Чипы формата: «торговый центр» (всё, что не специализированное) и специализированные, у которых в каталоге есть объекты. */
export function tcFormatChips(available: string[]): { label: string; values: string[] }[] {
  const special = new Set(TC_SPECIAL_FORMAT_CHIPS.flatMap((c) => c.values));
  const general = available.filter((f) => !special.has(f));
  return [
    ...(general.length ? [{ label: 'торговый центр', values: general }] : []),
    ...TC_SPECIAL_FORMAT_CHIPS.filter((c) => c.values.some((v) => available.includes(v))),
  ];
}

// Подборки по формату (владелец, 2026-09-30: «Рынки», «Мебельные центры»,
// «Аутлеты»): отдельные адреса /minsk/tc/format/<slug> с тем же каталогом,
// ограниченным форматом. В индекс — не меньше TC_FORMAT_HUB_MIN_CENTERS
// (для аутлетов — 1, хвост волны 5). ФАЙЛ-БЛИЗНЕЦ: slug и значения формата
// повторены в scripts/_tcPaths.mjs (TC_FORMAT_HUB_VALUES), сверяет тест.
export interface TcFormatHub {
  slug: string;
  values: string[];
  /** «Рынки Минска» — заголовок подборки. */
  title: string;
  /** «Рынки» — звено крошек и подпись ссылки. */
  label: string;
  /** «рынков Минска» — родительный падеж под «аналитика N …». */
  subjectGen: (n: number) => string;
  /** 1 рынок, 2 рынка, 5 рынков (без числа). */
  plural: (n: number) => string;
  /** Подзаголовок hero с числом объектов в начале. */
  intro: (countLabel: string) => string;
}

/** Обычный порог индексации format-хабов. Близнец — TC_FORMAT_HUB_MIN_CENTERS в _tcPaths.mjs. */
export const TC_FORMAT_HUB_MIN_CENTERS = 3;
/** Аутлетов мало — индексируем с 1 (владелец, хвост волны 5). */
export const TC_FORMAT_HUB_MIN_CENTERS_BY_SLUG: Record<string, number> = { outlets: 1 };

export function tcFormatHubMinCenters(slug: string): number {
  return TC_FORMAT_HUB_MIN_CENTERS_BY_SLUG[slug] ?? TC_FORMAT_HUB_MIN_CENTERS;
}

export const TC_FORMAT_HUBS: TcFormatHub[] = [
  {
    slug: 'markets',
    values: ['рынок'],
    title: 'Рынки Минска',
    label: 'Рынки',
    subjectGen: (n) => `${n % 10 === 1 && n % 100 !== 11 ? 'рынка' : 'рынков'} Минска`,
    plural: (n) => pluralRu(n, 'рынок', 'рынка', 'рынков'),
    intro: (count) => `${count} Минска и пригорода — адреса, площадь, парковка и часы работы.`,
  },
  {
    slug: 'furniture',
    values: ['мебельный центр'],
    title: 'Мебельные центры Минска',
    label: 'Мебельные центры',
    subjectGen: (n) => `${n % 10 === 1 && n % 100 !== 11 ? 'мебельного центра' : 'мебельных центров'} Минска`,
    plural: (n) => pluralRu(n, 'мебельный центр', 'мебельных центра', 'мебельных центров'),
    intro: (count) => `${count} Минска — адреса, площадь, парковка, часы работы и магазины внутри.`,
  },
  {
    slug: 'outlets',
    values: ['аутлет'],
    title: 'Аутлеты Минска',
    label: 'Аутлеты',
    subjectGen: (n) => `${n % 10 === 1 && n % 100 !== 11 ? 'аутлета' : 'аутлетов'} Минска`,
    plural: (n) => pluralRu(n, 'аутлет', 'аутлета', 'аутлетов'),
    intro: (count) => `${count} Минска — адреса, площадь, парковка, часы работы и бренды внутри.`,
  },
];

export function tcFormatHubBySlug(slug: string | undefined): TcFormatHub | null {
  return TC_FORMAT_HUBS.find((h) => h.slug === slug) ?? null;
}

export function tcFormatHubUrl(hub: TcFormatHub, basePath = '/minsk/tc'): string {
  return `${basePath}/format/${hub.slug}`;
}

/** Подборка, в которую попадает ТЦ этого формата (для крошек карточки). */
export function tcFormatHubOf(format: string | null | undefined): TcFormatHub | null {
  return format ? (TC_FORMAT_HUBS.find((h) => h.values.includes(format)) ?? null) : null;
}
