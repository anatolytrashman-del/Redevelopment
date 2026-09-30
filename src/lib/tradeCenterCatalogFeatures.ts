// Фильтры каталога ТЦ, которым не хватает колонок списка (владелец,
// 2026-09-30): «Магазин в ТЦ», «Что внутри», «Парковка», «Когда». Всё это
// лежит в retail_info и в снимке арендаторов Яндекса — тяжёлых полях,
// которых в /data/trade-centers.json нет. Сборка кладёт их выжимку в
// /data/tc-filters.json (scripts/generate-catalog-data.mjs, writeTcFilters),
// а смысл признаков считается здесь, чтобы правило жило в одном месте и
// проверялось тестом, а не дублировалось в JS сборки.
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

export function buildTcFilterEntry(src: TcFilterSource): TcFilterEntry {
  const features = new Set<string>();
  if (src.funKinds.includes('cinema')) features.add('cinema');
  if (src.funKinds.includes('kids')) features.add('kids');
  if (src.funKinds.some((k) => k === 'fitness' || k === 'sport')) features.add('fitness');
  if (src.foodZones > 0 || src.foodcourtPlaces > 0) features.add('foodcourt');
  if (src.anchorCategories.includes('гипермаркет')) features.add('grocery');
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

// Формат двумя группами вместо одного списка (владелец, 2026-09-30).
// Значения — как в колонке retail_format; подпись чипа короче: «гипермаркет»
// вместо «гипермаркет с галереей», строительный центр и автоцентр (по одному
// объекту) — одним чипом.
export const TC_FORMAT_GROUPS: { label: string; chips: { label: string; values: string[] }[] }[] = [
  {
    label: 'Торговые центры',
    chips: [
      { label: 'ТРЦ', values: ['ТРЦ'] },
      { label: 'ТЦ', values: ['ТЦ'] },
      { label: 'районный', values: ['районный ТЦ'] },
      { label: 'универмаг', values: ['универмаг'] },
      { label: 'гипермаркет', values: ['гипермаркет с галереей'] },
    ],
  },
  {
    label: 'Специализированные',
    chips: [
      { label: 'мебель', values: ['мебельный центр'] },
      { label: 'рынки', values: ['рынок'] },
      { label: 'стройка и авто', values: ['строительный центр', 'автоцентр'] },
      { label: 'аутлет', values: ['аутлет'] },
    ],
  },
];

/** Группы форматов с чипами, у которых в каталоге есть хоть одно значение; незнакомые форматы — в конец первой группы. */
export function tcFormatGroups(available: string[]) {
  const known = new Set(TC_FORMAT_GROUPS.flatMap((g) => g.chips.flatMap((c) => c.values)));
  const extra = available.filter((f) => !known.has(f)).map((f) => ({ label: f, values: [f] }));
  return TC_FORMAT_GROUPS.map((g, i) => ({
    label: g.label,
    chips: [...g.chips.filter((c) => c.values.some((v) => available.includes(v))), ...(i === 0 ? extra : [])],
  })).filter((g) => g.chips.length > 0);
}
