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


/**
 * Яндекс иногда склеивает несколько брендов в одну строку через запятую
 * («Bershka, Pull&Bear, …»). Для поиска и /store/* режем на отдельные имена.
 */
export function expandBrandNames(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const text = String(raw ?? '').trim();
    if (!text) continue;
    if (text.includes(',')) {
      for (const part of text.split(',')) {
        const piece = part.trim();
        if (piece) out.push(piece);
      }
    } else {
      out.push(text);
    }
  }
  return out;
}

/** Синонимы арендаторов → канонический ключ (после normalizeBrand). */
export const TC_STORE_BRAND_CANONICAL: Record<string, string> = {
  'd&f (бывший defacto)': 'defacto',
  'defacto outlet (d&f)': 'defacto',
  'магазин марко': 'марко',
};

export function canonicalBrandKey(normalized: string): string {
  return TC_STORE_BRAND_CANONICAL[normalized] ?? normalized;
}

/** Стабильные латинские slug'и для уже залитых /with/<бренд> → /store/<slug>. */
export const TC_STORE_SLUG_OVERRIDES: Record<string, string> = {
  'золотое яблоко': 'gold-apple',
  'спортмастер': 'sportmaster',
  'детмир': 'detmir',
  '5 элемент': '5-element',
  'mark formelle': 'mark-formelle',
  'pull&bear': 'pull-and-bear',
  'gloria jeans': 'gloria-jeans',
  'massimo dutti': 'massimo-dutti',
  'new yorker': 'new-yorker',
  'lc waikiki': 'lc-waikiki',
};

const CYR_TO_LAT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/** slug для /minsk/tc/store/<slug> — близнец slugifyTcBrand в scripts/_tcPaths.mjs. */
export function slugifyTcBrand(normalizedKey: string): string {
  const key = canonicalBrandKey(normalizedKey);
  const override = TC_STORE_SLUG_OVERRIDES[key];
  if (override) return override;
  let out = '';
  for (const ch of key) {
    if (CYR_TO_LAT[ch] !== undefined) out += CYR_TO_LAT[ch];
    else out += ch;
  }
  return (
    out
      .replace(/&/g, '-and-')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-') || 'brand'
  );
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
  for (const name of expandBrandNames(src.brands)) {
    const rawKey = normalizeBrand(name);
    const key = rawKey ? canonicalBrandKey(rawKey) : '';
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

/** Уникальный арендатор по всем ТЦ — для подсказок и быстрого отбора по «Магазин в ТЦ». */
export interface TcBrandRecord {
  key: string;
  name: string;
  count: number;
  slugs: string[];
}

export interface TcBrandCatalog {
  list: TcBrandRecord[];
  byKey: Map<string, TcBrandRecord>;
}

/** Один проход по индексу: уникальные бренды + в каких ТЦ они есть. */
export function buildTcBrandCatalog(index: TcFilterIndex): TcBrandCatalog {
  const byKey = new Map<string, TcBrandRecord>();
  for (const [slug, entry] of index) {
    entry.brands.forEach((key, i) => {
      let rec = byKey.get(key);
      if (!rec) {
        rec = { key, name: entry.brandNames[i], count: 0, slugs: [] };
        byKey.set(key, rec);
      }
      rec.count += 1;
      rec.slugs.push(slug);
    });
  }
  return { list: Array.from(byKey.values()), byKey };
}

/**
 * Подсказки под полем «Магазин в ТЦ»: точное совпадение, потом начинающиеся
 * с запроса (короче — выше), потом содержащие его. Каталог — уникальные
 * бренды (на проде ~7k), а не повторный обход всех упоминаний (~12k).
 */
export function brandSuggestions(catalog: TcBrandCatalog, query: string, limit = 6): string[] {
  const q = normalizeBrand(query);
  if (q.length < 2) return [];
  const hits: TcBrandRecord[] = [];
  for (const rec of catalog.list) {
    if (rec.key.includes(q)) hits.push(rec);
  }
  hits.sort(
    (a, b) =>
      Number(a.key !== q) - Number(b.key !== q) ||
      Number(!a.key.startsWith(q)) - Number(!b.key.startsWith(q)) ||
      a.key.length - b.key.length ||
      b.count - a.count ||
      a.key.localeCompare(b.key, 'ru'),
  );
  return hits.slice(0, limit).map((rec) => rec.name);
}

/**
 * Слаги ТЦ, где есть арендатор с подстрокой store. null — фильтра по
 * магазину нет (пустой запрос). Пустой Set — совпадений нет.
 */
export function matchingStoreSlugs(catalog: TcBrandCatalog, store: string): Set<string> | null {
  const q = normalizeBrand(store);
  if (!q) return null;
  const set = new Set<string>();
  for (const rec of catalog.list) {
    // Как matchesTcFeatures: подстрока, не только точное имя («za» → Zara).
    if (!rec.key.includes(q)) continue;
    for (const slug of rec.slugs) set.add(slug);
  }
  return set;
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
