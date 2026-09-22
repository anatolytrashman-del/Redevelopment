// Расчёты для справочника /minsk/bcminsk/gid.
//
// Почему отдельный файл, а не «просто useMemo на странице»: справочник
// перестал быть пересказом («класс A — современная инженерия и скоростные
// лифты», текст, который есть на полусотне сайтов) и держится теперь на
// собственных данных каталога — числа в таблице классов, тезис о двух
// ярусах рынка и окупаемость считаются из тех же 141 карточки и тех же
// снимков market_snapshots, что показывает аналитика. Значит, это не
// вёрстка, а логика, и её надо уметь прогнать тестом: формулировка на
// странице («разрыв между ярусами — 45%») верна ровно до тех пор, пока
// верен расчёт под ней.
//
// Второе правило этого файла: НИКАКИХ выдуманных чисел. Нет снимка по
// классу — блок просто не показывается; мало объявлений в срезе (см.
// MIN_RELIABLE_N) — число выводится с пометкой, а не молча.
import type { BusinessCenter } from '../data/businessCenters';
import { MIN_RELIABLE_N, type MarketSnapshot } from '../data/marketSnapshots';
import { BUSINESS_CLASSES, medianOf, paybackYears, type BusinessClass } from './businessCenterAnalytics';

export const GUIDE_SEGMENT = 'ofisy_bc';

export interface GuideRate {
  median: number;
  n: number;
  /** n ниже MIN_RELIABLE_N — число показываем, но с оговоркой. */
  reliable: boolean;
}

export interface GuideClassProfile {
  cls: BusinessClass;
  /** Сколько зданий этого класса в каталоге. */
  count: number;
  medianYear: number | null;
  medianArea: number | null;
  medianFloors: number | null;
  rent: GuideRate | null;
  sale: GuideRate | null;
  /** Валовая окупаемость покупки арендой, лет. */
  payback: number | null;
  /** До трёх зданий-эталонов класса — самые крупные из достроенных. */
  examples: BusinessCenter[];
}

function rateFrom(snapshots: MarketSnapshot[], deal: 'rent' | 'sale', cls: BusinessClass): GuideRate | null {
  const row = snapshots.find(
    (s) => s.segment === GUIDE_SEGMENT && s.sliceType === 'class' && s.sliceKey === cls && s.deal === deal,
  );
  if (!row || row.median == null || row.median <= 0) return null;
  return { median: row.median, n: row.n, reliable: row.n >= MIN_RELIABLE_N };
}

/**
 * Здания-эталоны класса. Отбор детерминированный: сначала достроенные
 * (стройку показывать как образец класса нельзя — её ещё никто не видел),
 * внутри — по убыванию общей площади, при равенстве по имени. Здания без
 * площади уходят в конец, но не выпадают совсем: у класса может не
 * оказаться ни одного с заполненной площадью.
 */
export function classExamples(centers: BusinessCenter[], cls: BusinessClass, limit = 3): BusinessCenter[] {
  return centers
    .filter((c) => c.businessClass === cls && c.status !== 'under_construction')
    .sort((a, b) => (b.totalArea ?? -1) - (a.totalArea ?? -1) || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit);
}

export function classProfiles(centers: BusinessCenter[], snapshots: MarketSnapshot[]): GuideClassProfile[] {
  return BUSINESS_CLASSES.map((cls) => {
    const inClass = centers.filter((c) => c.businessClass === cls);
    const rent = rateFrom(snapshots, 'rent', cls);
    const sale = rateFrom(snapshots, 'sale', cls);
    return {
      cls,
      count: inClass.length,
      medianYear: medianOf(
        inClass.filter((c) => c.status !== 'under_construction' && c.yearBuilt != null).map((c) => c.yearBuilt as number),
      ),
      medianArea: medianOf(inClass.filter((c) => c.totalArea != null).map((c) => c.totalArea as number)),
      medianFloors: medianOf(inClass.filter((c) => c.floors != null).map((c) => c.floors as number)),
      rent,
      sale,
      payback: paybackYears(rent?.median ?? null, sale?.median ?? null),
      examples: classExamples(centers, cls),
    };
  }).filter((p) => p.count > 0);
}

// --- Ярусы рынка --------------------------------------------------------

/**
 * Разрыв ставок ВНУТРИ яруса, выше которого ярус перестаёт быть ярусом:
 * классы в нём должны стоить практически одинаково, иначе объединять их в
 * одну строку текста нечестно.
 */
export const TIER_MAX_INNER_GAP_PCT = 10;
/** Разрыв МЕЖДУ ярусами, ниже которого тезис о двух ярусах не заявляется. */
export const TIER_MIN_GAP_PCT = 20;

export interface RentTier {
  classes: BusinessClass[];
  /** Медианные ставки классов яруса, в том же порядке. */
  rates: number[];
  low: number;
  high: number;
}

export interface RentTierSplit {
  tiers: [RentTier, RentTier];
  /** На сколько процентов верхний ярус дороже нижнего (по границе разрыва). */
  gapPct: number;
  /** Самый большой разрыв внутри ярусов — то самое «отличаются на N%». */
  innerGapPct: number;
}

function gapPct(higher: number, lower: number): number {
  return ((higher - lower) / lower) * 100;
}

/**
 * Тезис страницы: формальных классов четыре, а ярусов по цене — два (на
 * сентябрь 2026: A и B+ по $16, B и C по $11, между парами 45%). Считается,
 * а не пишется руками: данные поменяются — тезис либо обновится сам, либо
 * исчезнет со страницы.
 *
 * null означает «на текущих данных так сказать нельзя»: ставок меньше двух,
 * либо самый большой разрыв мал (рынок ровный), либо внутри получившихся
 * ярусов классы расходятся слишком сильно, чтобы называть их одним ярусом.
 */
export function rentTierSplit(profiles: GuideClassProfile[]): RentTierSplit | null {
  const withRate = profiles
    .filter((p): p is GuideClassProfile & { rent: GuideRate } => p.rent != null)
    .sort((a, b) => b.rent.median - a.rent.median);
  if (withRate.length < 3) return null;

  const gaps = withRate.slice(0, -1).map((p, i) => gapPct(p.rent.median, withRate[i + 1].rent.median));
  const maxGap = Math.max(...gaps);
  const splitAt = gaps.indexOf(maxGap);
  if (maxGap < TIER_MIN_GAP_PCT) return null;

  const inner = gaps.filter((_, i) => i !== splitAt);
  const innerGapPct = inner.length > 0 ? Math.max(...inner) : 0;
  if (innerGapPct > TIER_MAX_INNER_GAP_PCT) return null;

  const build = (part: (GuideClassProfile & { rent: GuideRate })[]): RentTier => ({
    classes: part.map((p) => p.cls),
    rates: part.map((p) => p.rent.median),
    low: Math.min(...part.map((p) => p.rent.median)),
    high: Math.max(...part.map((p) => p.rent.median)),
  });

  return {
    tiers: [build(withRate.slice(0, splitAt + 1)), build(withRate.slice(splitAt + 1))],
    gapPct: maxGap,
    innerGapPct,
  };
}

// --- Сколько платит арендатор ------------------------------------------

/** Ставка НДС в Беларуси, % (та же цифра, что в data/vat.ts и api/_vat.js). */
export const VAT_RATE_BY = 20;
/** Площадь «типового» офиса в примере расчёта, м². */
export const COST_EXAMPLE_AREA = 100;

export interface CostExample {
  cls: BusinessClass;
  area: number;
  ratePerSqm: number;
  /** Аренда за месяц по медианной ставке, без НДС. */
  monthlyNet: number;
  vatRate: number;
  monthlyWithVat: number;
  /** Обеспечительный платёж: обычно одна-две месячные ставки. */
  depositLow: number;
  depositHigh: number;
  /** Что нужно заплатить, чтобы въехать: первый месяц + депозит. */
  moveInLow: number;
  moveInHigh: number;
}

/**
 * Пример «сколько это стоит на самом деле» — на классе с самым большим
 * числом объявлений (то есть на том, который человек чаще всего и смотрит),
 * а не на выбранном руками. Считаем только то, что знаем из своих данных:
 * ставку, НДС и депозит в ставках. Эксплуатационные и коммунальные в наших
 * объявлениях не выделены — на странице они называются отдельной строкой
 * как «уточняется», и в расчёт не подставляются.
 */
export function costExample(profiles: GuideClassProfile[], area = COST_EXAMPLE_AREA): CostExample | null {
  const base = profiles
    .filter((p): p is GuideClassProfile & { rent: GuideRate } => p.rent != null && p.rent.reliable)
    .sort((a, b) => b.rent.n - a.rent.n)[0];
  if (!base) return null;
  const monthlyNet = base.rent.median * area;
  const monthlyWithVat = monthlyNet * (1 + VAT_RATE_BY / 100);
  return {
    cls: base.cls,
    area,
    ratePerSqm: base.rent.median,
    monthlyNet,
    vatRate: VAT_RATE_BY,
    monthlyWithVat,
    depositLow: monthlyWithVat,
    depositHigh: monthlyWithVat * 2,
    moveInLow: monthlyWithVat * 2,
    moveInHigh: monthlyWithVat * 3,
  };
}

// --- Форматирование -----------------------------------------------------

export function fmtMoney(value: number): string {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

export function fmtRate(value: number): string {
  // Ставка за метр — с одним знаком после запятой, но без «,0»: $16, а не
  // $16,0; при этом $15,9 не округляем до $16, иначе пропадает сам смысл
  // соседнего тезиса про разницу в проценты.
  const rounded = Math.round(value * 10) / 10;
  return `$${rounded.toLocaleString('ru-RU')}`;
}

export function fmtArea(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')} м²`;
}

export function fmtPct(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * '2026-09-01' → 'сентябрь 2026'. Дата строится по частям, а не
 * `new Date(period)`: разбор ISO-строки без времени идёт в UTC, и в минском
 * часовом поясе первое число месяца превращалось бы в последнее число
 * предыдущего.
 */
export function fmtPeriod(period: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(period ?? ''));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '');
}

/** Самый свежий период среди снимков — «актуально на» в шапке страницы. */
export function latestPeriod(snapshots: MarketSnapshot[]): string | null {
  const periods = snapshots.filter((s) => s.segment === GUIDE_SEGMENT).map((s) => s.period);
  return periods.length > 0 ? periods.sort().at(-1)! : null;
}
