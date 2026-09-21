// Аналитика по объявлениям одного здания: сводка сделки, зависимость цены
// метра от размера лота и окупаемость покупки арендой.
//
// Зачем отдельный файл, а не пара useMemo на странице: те же цифры нужны и
// блоку «Что сейчас сдают и продают», и FAQ под ним (правило владельца —
// FAQ описывает всё, что есть на странице, теми же данными, иначе они
// разойдутся).
//
// Почему не диапазон «$1 364–$2 065», как было до 2026-09-21: при пяти
// лотах диапазон не описывает рынок здания, а прячет закономерность. У
// «Саако» цена метра падает с размером лота (27,9 м² — $2 065, 345 м² —
// $1 364), и это не единичный случай: из 20 зданий с пятью и более лотами
// продажи у 13 связь «больше площадь → дешевле метр» отрицательная.
// Поэтому наружу отдаются сами лоты плюс явно посчитанная скидка за объём.
import type { DedupedOffer } from './businessCenterOfferDuplicates';

export type DealType = 'sale' | 'rent';

export interface SizeDiscount {
  smallSize: number;
  smallPrice: number;
  largeSize: number;
  largePrice: number;
  // На сколько процентов метр в самом крупном лоте дешевле, чем в самом мелком.
  dropPct: number;
}

export interface DealStats {
  deal: DealType;
  // Лоты по возрастанию площади — в таблице так видно, как меняется цена метра.
  lots: DedupedOffer[];
  count: number;
  // Цена считается по ОДНОМУ типу помещения — самому представленному в
  // здании (priceType), а не по всем лотам сразу. Медиана из офисов,
  // кладовой и точки сферы услуг не описывает ничего: у «Зелёного Луга»
  // это $654 и $2 012 за метр в одной выборке. По тому же типу идёт и
  // сравнение с рынком — срезы market_snapshots собраны по офисам.
  priceType: string;
  priceLots: DedupedOffer[];
  median: number;
  minPrice: number;
  maxPrice: number;
  sizeMin: number;
  sizeMax: number;
  // Стоимость лота целиком (площадь × ставка): для продажи — бюджет покупки,
  // для аренды — платёж в месяц. Человек считает деньгами, а не ставкой за метр.
  totalMin: number;
  totalMax: number;
  propertyTypes: { propertyType: string; count: number }[];
  sizeDiscount: SizeDiscount | null;
}

export interface YieldStats {
  propertyType: string;
  salePricePerSqm: number;
  rentPricePerSqm: number;
  // Валовая доходность, % годовых: ставка × 12 / цена покупки.
  grossYieldPct: number;
  paybackYears: number;
  saleCount: number;
  rentCount: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Лот учитываем, только когда известны ОБА числа: без площади нельзя
// посчитать бюджет, без ставки — нечего сравнивать. Ноль здесь означает
// «не указано», а не «бесплатно» (ловушка `!value` из CLAUDE.md).
function usable(offer: DedupedOffer): boolean {
  return Number.isFinite(offer.size) && offer.size > 0 && Number.isFinite(offer.pricePerSqm) && offer.pricePerSqm > 0;
}

// Коэффициент корреляции Пирсона — нужен, чтобы не выдавать за «скидку за
// объём» случайную разницу двух лотов.
function correlation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - meanX;
    const b = ys[i] - meanY;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

// Порог связи «площадь ↔ цена метра». −0,5 — консервативно: при четырёх
// лотах случайный набор такой корреляции почти не даёт, а реальная скидка
// за объём в живых данных выходит заметно сильнее (−0,8 и ниже).
const SIZE_DISCOUNT_CORRELATION = -0.5;
// Меньше 8% разницы в цене метра — это шум округления площадки, а не скидка.
const SIZE_DISCOUNT_MIN_DROP_PCT = 8;

function buildSizeDiscount(lots: DedupedOffer[]): SizeDiscount | null {
  if (lots.length < 4) return null;
  const corr = correlation(
    lots.map((o) => o.size),
    lots.map((o) => o.pricePerSqm),
  );
  if (corr === null || corr > SIZE_DISCOUNT_CORRELATION) return null;

  const small = lots[0];
  const large = lots[lots.length - 1];
  if (large.pricePerSqm >= small.pricePerSqm) return null;
  const dropPct = ((small.pricePerSqm - large.pricePerSqm) / small.pricePerSqm) * 100;
  if (dropPct < SIZE_DISCOUNT_MIN_DROP_PCT) return null;

  return {
    smallSize: small.size,
    smallPrice: small.pricePerSqm,
    largeSize: large.size,
    largePrice: large.pricePerSqm,
    dropPct,
  };
}

export function buildDealStats(offers: DedupedOffer[] | null | undefined, deal: DealType): DealStats | null {
  const lots = (offers ?? []).filter((o) => o.dealType === deal && usable(o)).sort((a, b) => a.size - b.size);
  if (lots.length === 0) return null;

  const sizes = lots.map((o) => o.size);
  const totals = lots.map((o) => o.size * o.pricePerSqm);

  const typeCounts = new Map<string, number>();
  for (const lot of lots) {
    const key = lot.propertyType ?? 'Без категории';
    typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
  }
  const propertyTypes = [...typeCounts]
    .map(([propertyType, count]) => ({ propertyType, count }))
    .sort((a, b) => b.count - a.count || a.propertyType.localeCompare(b.propertyType, 'ru'));

  const priceType = propertyTypes[0].propertyType;
  const priceLots = lots.filter((lot) => (lot.propertyType ?? 'Без категории') === priceType);
  const typePrices = priceLots.map((o) => o.pricePerSqm);

  return {
    deal,
    lots,
    count: lots.length,
    priceType,
    priceLots,
    median: median(typePrices),
    minPrice: Math.min(...typePrices),
    maxPrice: Math.max(...typePrices),
    sizeMin: Math.min(...sizes),
    sizeMax: Math.max(...sizes),
    totalMin: Math.min(...totals),
    totalMax: Math.max(...totals),
    propertyTypes,
    // Скидка за объём — тоже внутри одного типа: «кладовая дешевле офиса»
    // это не зависимость цены от площади, а разные товары.
    sizeDiscount: buildSizeDiscount(priceLots),
  };
}

// Рамки правдоподобия для валовой доходности. Ниже 3% и выше 20% годовых по
// коммерции в Минске — почти наверняка несопоставимые лоты, а не находка.
const MIN_YIELD_PCT = 3;
const MAX_YIELD_PCT = 20;

// Окупаемость считается только по ОДНОМУ типу помещения и только когда
// диапазоны площадей продажи и аренды пересекаются. Без этого правила
// «Порт-2» (единственный кабинет 18,5 м² в аренду против этажа 831 м² на
// продажу) давал 23% годовых — сравнение мелкой розницы с оптом, а не
// доходность. Фильтр по пересечению площадей оставляет 35 пар «здание ×
// тип» из 49, и все они укладываются в 4–18% годовых (проверка по базе,
// 2026-09-21).
export function buildYieldStats(offers: DedupedOffer[] | null | undefined): YieldStats | null {
  const lots = (offers ?? []).filter(usable);
  if (lots.length === 0) return null;

  const byType = new Map<string, { sale: DedupedOffer[]; rent: DedupedOffer[] }>();
  for (const lot of lots) {
    const key = lot.propertyType ?? 'Без категории';
    if (!byType.has(key)) byType.set(key, { sale: [], rent: [] });
    byType.get(key)![lot.dealType].push(lot);
  }

  const candidates: YieldStats[] = [];
  for (const [propertyType, group] of byType) {
    if (group.sale.length === 0 || group.rent.length === 0) continue;

    const saleSizes = group.sale.map((o) => o.size);
    const rentSizes = group.rent.map((o) => o.size);
    const overlaps = Math.min(...saleSizes) <= Math.max(...rentSizes) && Math.min(...rentSizes) <= Math.max(...saleSizes);
    if (!overlaps) continue;

    const salePricePerSqm = median(group.sale.map((o) => o.pricePerSqm));
    const rentPricePerSqm = median(group.rent.map((o) => o.pricePerSqm));
    const grossYieldPct = ((rentPricePerSqm * 12) / salePricePerSqm) * 100;
    if (grossYieldPct < MIN_YIELD_PCT || grossYieldPct > MAX_YIELD_PCT) continue;

    candidates.push({
      propertyType,
      salePricePerSqm,
      rentPricePerSqm,
      grossYieldPct,
      paybackYears: salePricePerSqm / (rentPricePerSqm * 12),
      saleCount: group.sale.length,
      rentCount: group.rent.length,
    });
  }
  if (candidates.length === 0) return null;

  // Самый представленный тип: больше лотов — надёжнее обе медианы.
  return candidates.sort(
    (a, b) => b.saleCount + b.rentCount - (a.saleCount + a.rentCount) || a.propertyType.localeCompare(b.propertyType, 'ru'),
  )[0];
}

// ——— формат ———

// Десятые долями метра площадки оперируют всерьёз: 113,4 и 113,5 м² —
// это два РАЗНЫХ лота, и округление до целого превращало их в «113» и
// «114», то есть выдумывало разницу там, где её нет.
export function formatArea(n: number): string {
  return `${formatAreaNumber(n)} м²`;
}

function formatAreaNumber(n: number): string {
  const rounded = n >= 1000 ? Math.round(n) : Math.round(n * 10) / 10;
  return rounded.toLocaleString('ru-RU');
}

// «27,9–345 м²», а не «27,9 м²–345 м²»: единица в диапазоне нужна один раз.
export function formatAreaRange(min: number, max: number): string {
  if (min === max) return formatArea(min);
  return `${formatAreaNumber(min)}–${formatArea(max)}`;
}

// Ставка за метр: у аренды она мелкая (десятые доли важны), у продажи —
// крупная, десятые в ней только мешают.
export function formatRate(n: number, deal: DealType): string {
  const rounded = deal === 'rent' ? Math.round(n * 10) / 10 : Math.round(n);
  return `$${rounded.toLocaleString('ru-RU')}`;
}

// Деньги за лот целиком. Точность до доллара тут ложная — ставка и так
// округлена площадкой, поэтому крупные суммы округляем до сотен, очень
// крупные показываем в миллионах.
export function formatMoney(n: number): string {
  if (n >= 1_000_000) {
    const millions = Math.round((n / 1_000_000) * 10) / 10;
    return `$${millions.toLocaleString('ru-RU')} млн`;
  }
  if (n >= 10_000) return `$${(Math.round(n / 100) * 100).toLocaleString('ru-RU')}`;
  return `$${Math.round(n).toLocaleString('ru-RU')}`;
}

export function formatYears(n: number): string {
  const rounded = Math.round(n);
  const lastTwo = rounded % 100;
  const last = rounded % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? 'лет' : last === 1 ? 'год' : last >= 2 && last <= 4 ? 'года' : 'лет';
  return `${rounded} ${word}`;
}

export function formatPercent(n: number): string {
  return `${(Math.round(n * 10) / 10).toLocaleString('ru-RU')}%`;
}

// «медиана по 5 лотам» — дательный падеж, отдельно от именительного:
// «медиана по 5 лотов» читается как опечатка.
export function formatLotsDative(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? 'лотам' : last === 1 ? 'лоту' : 'лотам';
  return `${n} ${word}`;
}

export function formatLotsCount(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? 'лотов' : last === 1 ? 'лот' : last >= 2 && last <= 4 ? 'лота' : 'лотов';
  return `${n} ${word}`;
}
