// Срезы для страницы /minsk/bcminsk/analytics.
//
// Отличие от market_snapshots (месячный снимок города/класса/района/здания,
// scripts/build-market-snapshots.mjs): там хранятся только те разрезы, что
// заранее заведены в скрипте. Всё, что требует признаков ЗДАНИЯ — возраст,
// удалённость от метро, тип управления, размер лота — посчитать из снимков
// нельзя, там уже агрегат. Поэтому эта страница берёт сырые объявления и
// режет их сама.
//
// ВАЖНО: чтобы цифры на странице не расходились с блоком «Ставки» (он
// читает market_snapshots), офисный срез здесь считается ровно так же, как
// в скрипте снимков: сначала схлопывание одного лота с нескольких площадок,
// потом фильтр property_type === 'Офисы'. Без фильтра медиана уезжает —
// магазины на первых этажах БЦ стоят заметно дороже офисов ($17 против $13
// на 2026-09-22), и 30% строк таблицы — не офисы.
import type { BusinessCenter } from '../data/businessCenters';
import type { BusinessCenterOfferSlice } from '../data/businessCenterOffers';
import { dedupeOffers, type Deduped } from './businessCenterOfferDuplicates';
import { percentileCont } from './businessCenterPriceCompare';

export const OFFICE_PROPERTY_TYPE = 'Офисы';

// Минимум объявлений в группе, ниже которого срез не показываем. Тот же
// смысл, что у MIN_RELIABLE_N для снимков, но порог ниже: там медиана
// печатается как самостоятельная цифра, здесь — как одна сторона
// сравнения, где важнее не точность значения, а знак разницы.
export const MIN_GROUP_N = 12;

export type CityOffer = Deduped<BusinessCenterOfferSlice> & { center: BusinessCenter };

/**
 * Офисный срез по всему каталогу: схлопнутые дубли + только «Офисы» +
 * только объявления, у которых нашлось здание в каталоге.
 *
 * Схлопывание идёт ПО ЗДАНИЯМ, а не по всему списку разом: dedupeOffers
 * сравнивает площадь, цену и источник, но не слаг (её зовут с одной
 * карточки, где здание одно), и на городском списке два одинаковых
 * кабинета в РАЗНЫХ зданиях слиплись бы в один лот.
 */
export function buildCityOffers(
  centers: BusinessCenter[] | null,
  offers: BusinessCenterOfferSlice[] | null,
  deal: 'rent' | 'sale',
): CityOffer[] {
  if (!centers || !offers) return [];
  const bySlug = new Map(centers.map((c) => [c.slug, c]));
  const grouped = new Map<string, BusinessCenterOfferSlice[]>();
  for (const o of offers) {
    if (o.dealType !== deal) continue;
    if (!bySlug.has(o.businessCenterSlug)) continue;
    const list = grouped.get(o.businessCenterSlug);
    if (list) list.push(o);
    else grouped.set(o.businessCenterSlug, [o]);
  }
  const result: CityOffer[] = [];
  for (const [slug, list] of grouped) {
    const center = bySlug.get(slug)!;
    for (const d of dedupeOffers(list)) {
      if (d.propertyType !== OFFICE_PROPERTY_TYPE) continue;
      if (!(d.pricePerSqm > 0)) continue;
      result.push({ ...d, center });
    }
  }
  return result;
}

/**
 * «11,8 года», «8 лет» — с запятой и правильным словом, а не 11.8.
 * Дробное число всегда требует родительного падежа единственного числа
 * («8,9 года», не «8,9 лет») — по нему и идёт первая ветка; целые склоняются
 * обычным правилом (1 год… но «год» здесь не нужен, у нас всегда «лет» или
 * «года» после числа, ср. «21 года»).
 */
export function fmtYears(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const whole = Math.floor(rounded);
  const fractional = rounded !== whole;
  const word = fractional || (whole % 10 === 1 && whole % 100 !== 11) ? 'года' : 'лет';
  return `${rounded.toLocaleString('ru-RU')} ${word}`;
}

export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return percentileCont([...values].sort((a, b) => a - b), 0.5);
}

// --- Драйверы ставки ----------------------------------------------------

export interface DriverSide {
  label: string;
  n: number;
  median: number;
}

export interface PriceDriver {
  id: string;
  title: string;
  low: DriverSide;
  high: DriverSide;
  /** Насколько дороже дорогая сторона, в процентах. */
  deltaPct: number;
  /** Что с этим делать читателю — одна фраза, не пересказ цифр. */
  hint: string;
  /**
   * Дороже оказалась та сторона, которая и должна была быть дороже.
   * Нужно, чтобы подпись не спорила с цифрами: данные пересобираются
   * синком, и признак, сегодня дающий надбавку, завтра может дать скидку
   * (так уже вышло с кондиционированием — здания с ним оказались дешевле,
   * потому что источник заполняет это поле не у всех и не случайно).
   * Перевернувшийся срез не выбрасываем, а честно подписываем: признак,
   * который в одиночку ставку не объясняет, — тоже результат.
   */
  asExpected: boolean;
}

// Надбавка меньше этого порога — шум выборки, а не признак: на 2026-09-22
// паркинг давал +2%, и строка «от 2 мест на 100 м² против меньше 2» в
// списке драйверов читалась как вывод, хотя вывода там нет.
export const MIN_DRIVER_DELTA_PCT = 8;

// `a` — сторона, которая ПО СМЫСЛУ должна быть дороже (см. asExpected).
type Side = { label: string; test: (c: BusinessCenter) => boolean };

const DRIVER_DEFS: { id: string; title: string; a: Side; b: Side; hint: string }[] = [
  {
    id: 'metro',
    title: 'Пешком до метро',
    a: { label: 'шаговая доступность', test: (c) => c.metroDistanceBucket === 'walking' },
    b: { label: 'больше 3 остановок', test: (c) => c.metroDistanceBucket === 'over_3_stops' },
    hint: 'Самая дорогая характеристика здания — и единственная, которую нельзя улучшить ремонтом.',
  },
  {
    id: 'class',
    title: 'Класс здания',
    a: { label: 'A и B+', test: (c) => c.businessClass === 'A' || c.businessClass === 'B+' },
    b: { label: 'B и C', test: (c) => c.businessClass === 'B' || c.businessClass === 'C' },
    hint: 'Класс — это сумма всего остального: инженерии, паркинга, отделки, возраста.',
  },
  {
    id: 'age',
    title: 'Возраст здания',
    a: { label: 'построены с 2016', test: (c) => c.yearBuilt != null && c.yearBuilt >= 2016 },
    b: { label: 'построены до 2011', test: (c) => c.yearBuilt != null && c.yearBuilt < 2011 },
    hint: 'Разница не только в фасаде: в зданиях до 2011 года реже встречается центральное кондиционирование.',
  },
  {
    id: 'services',
    title: 'Сервисы на первых этажах',
    a: { label: 'два и больше', test: (c) => c.infraInternal.length >= 2 },
    b: { label: 'меньше двух', test: (c) => c.infraInternal.length < 2 },
    hint: 'Кофейня и банк внизу — не бонус, а часть ставки: за них платят и те, кто ими не пользуется.',
  },
  {
    id: 'size',
    title: 'Размер здания',
    a: { label: 'от 15 тыс. м²', test: (c) => c.totalArea != null && c.totalArea >= 15000 },
    b: { label: 'меньше 15 тыс. м²', test: (c) => c.totalArea != null && c.totalArea < 15000 },
    hint: 'В крупном здании дороже метр, но там же обычно паркинг, лифты и сервисы — сравнивать надо с ними.',
  },
  {
    id: 'management',
    title: 'Кто управляет',
    a: { label: 'единая УК', test: (c) => c.managementType === 'single_uk' },
    b: { label: 'товарищество собственников', test: (c) => c.managementType === 'hoa' },
    hint: 'У товарищества дешевле и можно торговаться с конкретным владельцем, но условия разные на каждом этаже.',
  },
];

export function buildPriceDrivers(offers: CityOffer[]): PriceDriver[] {
  const drivers: PriceDriver[] = [];
  for (const def of DRIVER_DEFS) {
    const side = (s: Side): DriverSide | null => {
      const values = offers.filter((o) => s.test(o.center)).map((o) => o.pricePerSqm);
      if (values.length < MIN_GROUP_N) return null;
      const m = medianOf(values);
      return m == null ? null : { label: s.label, n: values.length, median: m };
    };
    const a = side(def.a);
    const b = side(def.b);
    if (!a || !b) continue;
    const asExpected = a.median >= b.median;
    const [high, low] = asExpected ? [a, b] : [b, a];
    if (low.median <= 0) continue;
    const deltaPct = Math.round(((high.median - low.median) / low.median) * 100);
    if (deltaPct < MIN_DRIVER_DELTA_PCT) continue;
    drivers.push({
      id: def.id,
      title: def.title,
      low,
      high,
      deltaPct,
      hint: asExpected
        ? def.hint
        : 'По каталогу вышло наоборот: в одиночку этот признак ставку не объясняет — он тянет за собой класс, район и возраст здания.',
      asExpected,
    });
  }
  return drivers.sort((x, y) => y.deltaPct - x.deltaPct);
}

// --- Размер лота --------------------------------------------------------

export interface LotBucket {
  label: string;
  min: number;
  max: number | null;
  n: number;
  median: number | null;
  /** Суммарная площадь предложения в этой корзине, м². */
  area: number;
}

const LOT_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: 'до 50 м²', min: 0, max: 50 },
  { label: '50–100 м²', min: 50, max: 100 },
  { label: '100–200 м²', min: 100, max: 200 },
  { label: '200–500 м²', min: 200, max: 500 },
  { label: 'от 500 м²', min: 500, max: null },
];

export function buildLotBuckets(offers: CityOffer[]): LotBucket[] {
  return LOT_BUCKETS.map((b) => {
    const inside = offers.filter((o) => o.size >= b.min && (b.max == null || o.size < b.max));
    return {
      ...b,
      n: inside.length,
      median: medianOf(inside.map((o) => o.pricePerSqm)),
      area: inside.reduce((sum, o) => sum + o.size, 0),
    };
  });
}

// --- Возраст фонда ------------------------------------------------------

export type BusinessClass = 'A' | 'B+' | 'B' | 'C';
export const BUSINESS_CLASSES: BusinessClass[] = ['A', 'B+', 'B', 'C'];

export interface VintageCohort {
  label: string;
  from: number;
  to: number | null;
  total: number;
  area: number;
  byClass: Record<BusinessClass, number>;
}

const VINTAGE_COHORTS: { label: string; from: number; to: number | null }[] = [
  { label: 'до 2001', from: 0, to: 2001 },
  { label: '2001–2005', from: 2001, to: 2006 },
  { label: '2006–2010', from: 2006, to: 2011 },
  { label: '2011–2015', from: 2011, to: 2016 },
  { label: '2016–2020', from: 2016, to: 2021 },
  { label: 'с 2021', from: 2021, to: null },
];

export function buildVintageCohorts(centers: BusinessCenter[]): VintageCohort[] {
  return VINTAGE_COHORTS.map((c) => {
    const inside = centers.filter(
      (b) => b.yearBuilt != null && b.yearBuilt >= c.from && (c.to == null || b.yearBuilt < c.to),
    );
    const byClass = { A: 0, 'B+': 0, B: 0, C: 0 } as Record<BusinessClass, number>;
    for (const b of inside) if (b.businessClass) byClass[b.businessClass] += 1;
    return {
      ...c,
      total: inside.length,
      area: inside.reduce((sum, b) => sum + (b.totalArea ?? 0), 0),
      byClass,
    };
  }).filter((c) => c.total > 0);
}

// --- Окупаемость --------------------------------------------------------

/**
 * За сколько лет аренда по медианной ставке вернёт медианную цену покупки
 * того же метра. Грубая прикидка «в лоб»: без простоя, налога, эксплуатации
 * и изменения цен — именно так её и надо подписывать на странице.
 */
export function paybackYears(rentMedian: number | null, saleMedian: number | null): number | null {
  if (rentMedian == null || saleMedian == null || rentMedian <= 0) return null;
  return saleMedian / (rentMedian * 12);
}

// --- Предложение по зданиям --------------------------------------------

export interface BuildingSupply {
  center: BusinessCenter;
  lots: number;
  area: number;
  median: number | null;
}

export function buildBuildingSupply(offers: CityOffer[], minLots = 1): BuildingSupply[] {
  const bySlug = new Map<string, CityOffer[]>();
  for (const o of offers) {
    const list = bySlug.get(o.center.slug);
    if (list) list.push(o);
    else bySlug.set(o.center.slug, [o]);
  }
  return [...bySlug.values()]
    .filter((list) => list.length >= minLots)
    .map((list) => ({
      center: list[0].center,
      lots: list.length,
      area: list.reduce((sum, o) => sum + o.size, 0),
      median: medianOf(list.map((o) => o.pricePerSqm)),
    }));
}
