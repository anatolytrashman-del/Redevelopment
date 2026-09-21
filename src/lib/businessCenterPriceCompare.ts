// Блок «Цены в здании и по рынку» на карточке БЦ (заменил два предложения
// с процентами в #rate-comparison, владелец — 2026-09-21).
//
// Что поменялось по сравнению с прежним текстом и почему:
//
// 1. Вместо «медианы» — КОРИДОР p25–p75. У группы из 43 разных зданий нет
//    одной «правильной цены»: разброс ВНУТРИ класса B ($6,6–$19,0 по
//    зданиям) почти вдвое больше, чем разброс МЕЖДУ классами ($11,4 у C
//    против $18,1 у A). То же с районами. Значит «дороже медианы класса»
//    значит всего лишь «дороже половины таких же» — коридор говорит ровно
//    это и ничего сверх.
// 2. Базы считаются ПО ЗДАНИЯМ, а не по объявлениям. Срезы class/district
//    в market_snapshots — это перцентили по объявлениям, поэтому БЦ с 26
//    объявлениями весит там как 26 зданий. Из-за этого по Московскому
//    району класс A выходил дешевле класса B (артефакт весов), а медиана
//    района была $12,88 вместо $14,0 по зданиям — для «Саако» это разница
//    между «+16% к району» и «практически как у соседей». Здесь на входе
//    building-срезы (по одному на здание) — один БЦ даёт ровно один голос.
// 3. Сравнение с «соседними зданиями» по расстоянию убрано совсем: под
//    такую базу попадает 2–3 здания, и радиусами человек не мыслит.
//
// Офисы-only и схлопывание одного лота с разных площадок делать здесь не
// нужно — building-срезы приходят уже такими (см. dedupeBcOffers и фильтр
// property_type в scripts/build-market-snapshots.mjs).
import type { BusinessCenter } from '../data/businessCenters';
import type { MarketSnapshot } from '../data/marketSnapshots';
import type { CatalogOfferIndex } from './businessCenterCatalogFilter';
import { pluralRu } from './pluralRu';

// Меньше пяти зданий — это не «цены района», а случайный набор: у района
// из двух БЦ (Заводской: 43 объявления, но всего 2 здания) коридор
// описывает эти два здания, а не район. Порог именно в ЗДАНИЯХ — прежний
// MIN_RELIABLE_N считал объявления и такую выборку пропускал.
export const MIN_COMPARE_BUILDINGS = 5;

// Границы коридора ближе этого друг к другу — показываем одно число, а не
// «$15 – 15»: у двух третей зданий (65 из 98 по аренде) разброс внутри
// здания меньше этого порога.
const SINGLE_VALUE_RATIO = 1.1;

export interface PriceCard {
  label: string;
  value: string;
  note: string;
}

export interface PriceDealBlock {
  deal: 'rent' | 'sale';
  title: string;
  // «у верхней границы», «обычная цена»… — словами, без процентов и без
  // цвета: «дороже» на странице, где мы это здание и предлагаем, не авария.
  verdict: string;
  self: PriceCard;
  bases: PriceCard[];
}

export interface PriceComparison {
  blocks: PriceDealBlock[];
}

// Тот же расчёт, что у percentile_cont в Postgres (линейная интерполяция),
// чтобы коридор здания из снимка и коридор группы, посчитанный здесь,
// считались одинаково.
export function percentileCont(sortedAsc: number[], q: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = q * (sortedAsc.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

// Доллар только у первого числа: «$1 430 – 2 050». С двумя знаками длинные
// цены продажи не влезают в плитку, а читается не лучше.
function formatRange(low: number, high: number): string {
  const lowText = formatMoney(low);
  const highText = formatMoney(high);
  return lowText === highText ? lowText : `${lowText} – ${highText.slice(1)}`;
}

function buildingsWithOffers(centers: BusinessCenter[], snapshots: Map<string, MarketSnapshot>): { slug: string; median: number }[] {
  const out: { slug: string; median: number }[] = [];
  for (const c of centers) {
    const s = snapshots.get(c.slug);
    if (s?.median != null) out.push({ slug: c.slug, median: s.median });
  }
  return out;
}

interface Corridor {
  low: number;
  high: number;
}

function corridorOf(values: number[]): Corridor | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const low = percentileCont(sorted, 0.25);
  const high = percentileCont(sorted, 0.75);
  return low == null || high == null ? null : { low, high };
}

// +1 — здание выше коридора, −1 — ниже, 0 — внутри.
function sideOf(value: number, corridor: Corridor): number {
  if (value > corridor.high) return 1;
  if (value < corridor.low) return -1;
  return 0;
}

// Среднее по базам, а не сумма: с одной базой «выше» должно читаться как
// «дороже большинства», а не как «у верхней границы».
export function verdictText(value: number, corridors: Corridor[]): string {
  const avg = corridors.reduce((acc, c) => acc + sideOf(value, c), 0) / corridors.length;
  if (avg >= 1) return 'дороже большинства';
  if (avg > 0) return 'у верхней границы';
  if (avg <= -1) return 'дешевле большинства';
  if (avg < 0) return 'у нижней границы';
  return 'обычная цена';
}

function selfValueText(snapshot: MarketSnapshot): string | null {
  const { p25, p75, median } = snapshot;
  if (p25 != null && p75 != null && p25 > 0 && p75 / p25 >= SINGLE_VALUE_RATIO) return formatRange(p25, p75);
  const single = median ?? p25 ?? p75;
  return single == null ? null : formatMoney(single);
}

function buildingsNote(count: number, prefix?: string): string {
  const tail = `${count} ${pluralRu(count, 'здание', 'здания', 'зданий')}`;
  return prefix ? `${prefix}, ${tail}` : tail;
}

function buildDeal(
  deal: 'rent' | 'sale',
  center: BusinessCenter,
  all: BusinessCenter[],
  bySlug: Map<string, MarketSnapshot>,
): PriceDealBlock | null {
  const self = bySlug.get(center.slug);
  if (self?.median == null) return null;
  const selfValue = selfValueText(self);
  if (selfValue == null) return null;

  const bases: PriceCard[] = [];
  const corridors: Corridor[] = [];

  if (center.businessClass) {
    const peers = buildingsWithOffers(
      all.filter((c) => c.businessClass === center.businessClass),
      bySlug,
    );
    const corridor = peers.length >= MIN_COMPARE_BUILDINGS ? corridorOf(peers.map((p) => p.median)) : null;
    if (corridor) {
      bases.push({
        label: 'Такие же БЦ',
        value: formatRange(corridor.low, corridor.high),
        note: buildingsNote(peers.length, `класс ${center.businessClass}`),
      });
      corridors.push(corridor);
    }
  }

  // Район — если в нём набралось хотя бы пять зданий с объявлениями; иначе
  // на то же место встаёт город. Плиток всегда одинаковое число, меняется
  // только подпись: пустого места на странице не остаётся.
  const districtPeers = center.district
    ? buildingsWithOffers(
        all.filter((c) => c.district === center.district),
        bySlug,
      )
    : [];
  if (districtPeers.length >= MIN_COMPARE_BUILDINGS) {
    const corridor = corridorOf(districtPeers.map((p) => p.median));
    if (corridor) {
      bases.push({
        label: 'БЦ в этом районе',
        value: formatRange(corridor.low, corridor.high),
        note: buildingsNote(districtPeers.length, center.district ?? undefined),
      });
      corridors.push(corridor);
    }
  } else {
    const cityPeers = buildingsWithOffers(all, bySlug);
    const corridor = cityPeers.length >= MIN_COMPARE_BUILDINGS ? corridorOf(cityPeers.map((p) => p.median)) : null;
    if (corridor) {
      bases.push({ label: 'Все БЦ Минска', value: formatRange(corridor.low, corridor.high), note: buildingsNote(cityPeers.length) });
      corridors.push(corridor);
    }
  }

  // Одна цена без единой базы сравнения — это не сравнение, а просто число;
  // оно и так есть в таблице «Что сейчас сдают и продают в здании» выше.
  if (corridors.length === 0) return null;

  return {
    deal,
    title: deal === 'rent' ? 'Аренда · за м² в месяц' : 'Продажа · за м²',
    verdict: verdictText(self.median, corridors),
    self: {
      label: 'Здесь',
      value: selfValue,
      note: `${self.n} ${pluralRu(self.n, 'предложение', 'предложения', 'предложений')} в здании`,
    },
    bases,
  };
}

export function buildPriceComparison(center: BusinessCenter, all: BusinessCenter[], offers: CatalogOfferIndex): PriceComparison {
  const blocks: PriceDealBlock[] = [];
  const rent = buildDeal('rent', center, all, offers.rentBySlug);
  if (rent) blocks.push(rent);
  const sale = buildDeal('sale', center, all, offers.saleBySlug);
  if (sale) blocks.push(sale);
  return { blocks };
}
