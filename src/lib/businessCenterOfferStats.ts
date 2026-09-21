// Аналитика по объявлениям одного здания: сводка сделки и зависимость
// цены метра от размера помещения.
//
// Окупаемость покупки арендой тут была и убрана 2026-09-21 по решению
// владельца («давай не считать окупаемость вообще»). Причина — в самих
// данных: в здании продают одни помещения, а сдают другие, и деление
// медианы продажи на медиану аренды сравнивает мелкий кабинет с целым
// этажом. Замер по базе: против расчёта по сопоставимым площадям такой
// способ расходится в среднем на 1,5 года, на «Центрополе» — на 8,9
// (5,6 года против 14,6). Честный расчёт (попарно, площади в пределах
// ×2) возможен, но владелец решил показатель не показывать вовсе.
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

// ——— формат ———

// Десятые долями метра площадки оперируют всерьёз: 113,4 и 113,5 м² —
// это два РАЗНЫХ лота, и округление до целого превращало их в «113» и
// «114», то есть выдумывало разницу там, где её нет.
export function formatArea(n: number): string {
  const rounded = n >= 1000 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${rounded.toLocaleString('ru-RU')} м²`;
}

// Ставка за метр: у аренды она мелкая (десятые доли важны), у продажи —
// крупная, десятые в ней только мешают.
export function formatRate(n: number, deal: DealType): string {
  const rounded = deal === 'rent' ? Math.round(n * 10) / 10 : Math.round(n);
  return `$${rounded.toLocaleString('ru-RU')}`;
}

// Деньги за помещение целиком. Точность до доллара тут ложная — ставка и так
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
