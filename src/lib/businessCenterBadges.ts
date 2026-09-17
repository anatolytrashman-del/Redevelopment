// К8 плана docs/bc-catalog-redesign-plan.md — авто-бейдж «чем выделяется».
//
// Одна функция от всего списка БЦ, без единой строки ручного текста: бейдж
// появляется ТОЛЬКО когда условие реально выполнено на данных, а если
// зданию нечем выделиться — бейджа нет, и это нормально. Ровно это имел в
// виду принцип «не выдумываем» из плана: лучше пусто, чем натянутая
// похвала у каждой карточки (тогда бейдж перестаёт что-либо значить).
//
// Почему пороги, а не «лучше среднего»: бейдж должен быть проверяемым
// утверждением: разницу со ставкой класса можно проверить по снимку рынка.
import type { BusinessCenter } from '../data/businessCenters';
import type { MarketSnapshot } from '../data/marketSnapshots';
import { nearestMetroMeters, type CatalogOfferIndex } from './businessCenterCatalogFilter';

// Район из одного-двух зданий — не выборка. Ниже этого порога районные
// бейджи не считаем вовсе.
const MIN_DISTRICT_SIZE = 3;

// Насколько ставка должна быть ниже медианы класса, чтобы об этом стоило
// писать. 10% — это уже заметная разница в деньгах на годовом договоре, а
// шум месячного снимка меньше.
const CHEAPER_THRESHOLD = 0.1;

export interface BusinessCenterBadge {
  text: string;
  // 'deal' — про деньги (зелёный), 'fact' — про здание (нейтральный).
  tone: 'deal' | 'fact';
}

export interface BadgeContext {
  nearestMetroInDistrict: Map<string, string>;
  soleClassInDistrict: Map<string, string>;
  classRentMedian: Map<string, number>;
  offers: CatalogOfferIndex;
}

export function buildBadgeContext(
  centers: BusinessCenter[],
  snapshots: MarketSnapshot[] | null,
  offers: CatalogOfferIndex,
): BadgeContext {
  const byDistrict = new Map<string, BusinessCenter[]>();
  for (const c of centers) {
    if (!c.district) continue;
    const list = byDistrict.get(c.district) ?? [];
    list.push(c);
    byDistrict.set(c.district, list);
  }

  const nearestMetroInDistrict = new Map<string, string>();
  const soleClassInDistrict = new Map<string, string>();

  for (const [district, list] of byDistrict) {
    if (list.length < MIN_DISTRICT_SIZE) continue;

    const withMetro = list.filter((c) => nearestMetroMeters(c) != null);
    if (withMetro.length >= MIN_DISTRICT_SIZE) {
      const top = withMetro.reduce((a, b) => ((nearestMetroMeters(a) ?? Infinity) <= (nearestMetroMeters(b) ?? Infinity) ? a : b));
      nearestMetroInDistrict.set(district, top.slug);
    }

    // «Единственный класс X в районе» — только для верхних классов: быть
    // единственным зданием класса C в районе не отличие, а случайность.
    const byClass = new Map<string, BusinessCenter[]>();
    for (const c of list) {
      if (!c.businessClass) continue;
      const arr = byClass.get(c.businessClass) ?? [];
      arr.push(c);
      byClass.set(c.businessClass, arr);
    }
    for (const [cls, arr] of byClass) {
      if (arr.length === 1 && (cls === 'A' || cls === 'B+')) {
        soleClassInDistrict.set(`${district}|${cls}`, arr[0].slug);
      }
    }
  }

  const classRentMedian = new Map<string, number>();
  for (const s of snapshots ?? []) {
    if (s.sliceType === 'class' && s.deal === 'rent' && s.median != null) classRentMedian.set(s.sliceKey, s.median);
  }

  return { nearestMetroInDistrict, soleClassInDistrict, classRentMedian, offers };
}

// Один бейдж на карточку: два-три ярлыка рядом читаются как реклама, а не
// как факт. Порядок — по тому, что реально влияет на решение: сперва
// деньги, потом редкость, потом дорога.
export function businessCenterBadge(center: BusinessCenter, ctx: BadgeContext): BusinessCenterBadge | null {
  const rent = ctx.offers.rentBySlug.get(center.slug)?.median;
  const classMedian = center.businessClass ? ctx.classRentMedian.get(center.businessClass) : undefined;
  if (rent != null && classMedian != null && classMedian > 0) {
    const diff = (classMedian - rent) / classMedian;
    if (diff >= CHEAPER_THRESHOLD) {
      return { text: `Дешевле медианы класса ${center.businessClass} на ${Math.round(diff * 100)}%`, tone: 'deal' };
    }
  }

  if (center.district && center.businessClass) {
    if (ctx.soleClassInDistrict.get(`${center.district}|${center.businessClass}`) === center.slug) {
      return { text: `Единственный класс ${center.businessClass} в районе`, tone: 'fact' };
    }
  }
  if (center.district && ctx.nearestMetroInDistrict.get(center.district) === center.slug) {
    const m = nearestMetroMeters(center);
    return { text: m != null ? `Ближе всех к метро в районе — ${m} м` : 'Ближе всех к метро в районе', tone: 'fact' };
  }
  return null;
}
