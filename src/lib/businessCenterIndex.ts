// К9 плана docs/bc-catalog-redesign-plan.md — «Индекс Redevelopment».
// Решение владельца 2026-09-16: делаем, с открытой методикой.
//
// Что это и чем НЕ является. Это композит 0–100 из пяти подшкал, целиком
// построенный на ФАКТАХ каталога (расстояния, класс, парковка, состав
// инфраструктуры, наличие активных объявлений). Это НЕ агрегированный
// рейтинг из чужих отзывов: решение не публиковать AggregateRating из
// BCMINSK_SEO_PLAN.md остаётся в силе, оценки пользователей 2ГИС и Яндекса
// в индекс не входят вовсе — они показываются отдельно и как есть.
//
// Три правила, от которых зависит, можно ли индексу верить:
//
// 1. ПОРОГИ ФИКСИРОВАННЫЕ, а не перцентили выборки. Перцентиль означал бы,
//    что оценка здания меняется, когда в каталог добавили другие здания, —
//    сравнивать его с прошлогодним снимком стало бы нельзя.
// 2. ОТСУТСТВИЕ ДАННЫХ — НЕ НОЛЬ. Подшкала без данных не участвует в
//    расчёте вовсе, а её вес перераспределяется на остальные; рядом с
//    индексом всегда пишется, по скольким подшкалам он посчитан. Иначе
//    здание с неполными данными выглядело бы плохим, хотя про него просто
//    меньше известно.
// 3. МИНИМУМ ТРИ ПОДШКАЛЫ. По одной-двум это уже не индекс, а случайность:
//    такому зданию индекс не показывается совсем.
import type { BusinessCenter } from '../data/businessCenters';
import { haversineMeters } from './businessCenterMarketPosition';
import { nearestMetroMeters, type CatalogOfferIndex } from './businessCenterCatalogFilter';

export const MIN_INDEX_SUBSCALES = 3;

// Площадь Независимости — общепринятая точка отсчёта «центра» Минска.
const CITY_CENTER: [number, number] = [53.8955, 27.5486];

export type SubscaleKey = 'location' | 'building' | 'parking' | 'infra' | 'market';

export const SUBSCALE_META: Record<SubscaleKey, { label: string; weight: number; what: string }> = {
  location: {
    label: 'Локация',
    weight: 30,
    what: 'расстояние до ближайшего метро и до центра города',
  },
  building: {
    label: 'Здание',
    weight: 25,
    what: 'деловой класс, высота потолков, число лифтов на площадь, кондиционирование',
  },
  parking: { label: 'Парковка', weight: 15, what: 'машиномест на 100 м² по данным prometr.by' },
  infra: {
    label: 'Инфраструктура',
    weight: 15,
    what: 'что есть внутри здания и что в шаговой доступности',
  },
  market: {
    label: 'Рынок',
    weight: 15,
    what: 'есть ли сейчас активные объявления об аренде и продаже и какой у здания рейтинг 2ГИС',
  },
};

// Линейная шкала между двумя порогами с обрезкой по краям. Вынесена
// отдельно, чтобы каждый порог было видно в одном месте и можно было
// пересказать словами на странице методики.
function scale(value: number, worst: number, best: number): number {
  if (worst === best) return 0;
  const t = (value - worst) / (best - worst);
  return Math.max(0, Math.min(1, t)) * 100;
}

// Среднее только по тем частям, где данные есть.
function averageKnown(parts: (number | null)[]): number | null {
  const known = parts.filter((v): v is number => v != null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0) / known.length;
}

export interface SubscaleScore {
  key: SubscaleKey;
  score: number;
}

export interface BusinessCenterIndex {
  value: number;
  subscales: SubscaleScore[];
  /** Сколько подшкал из пяти удалось посчитать — показывается рядом с числом. */
  known: number;
}

function locationScore(center: BusinessCenter): number | null {
  const metro = nearestMetroMeters(center);
  // 300 м — «вышел и ты у метро», 1500 м — верхняя граница, которую мы уже
  // считаем «у метро» в хабах станций (METRO_HUB_MAX_DISTANCE_M).
  const metroPart = metro == null ? null : scale(metro, 1500, 300);
  const centerPart =
    center.lat != null && center.lng != null
      ? // 8 км от площади Независимости — это уже окраина Минска.
        scale(haversineMeters(center.lat, center.lng, CITY_CENTER[0], CITY_CENTER[1]), 8000, 500)
      : null;
  return averageKnown([metroPart, centerPart]);
}

const CLASS_SCORE: Record<string, number> = { A: 100, 'B+': 80, B: 60, C: 40 };

function buildingScore(center: BusinessCenter): number | null {
  const classPart = center.businessClass ? CLASS_SCORE[center.businessClass] : null;
  // 2,5 м — минимум, встречающийся в данных; 3,5 м — потолки, о которых
  // пишут в описании как о преимуществе.
  const ceilingPart = center.ceilingHeight == null ? null : scale(center.ceilingHeight, 2.5, 3.5);
  // Один лифт на 3 000 м² — комфортно, на 12 000 — очереди в час пик.
  const elevatorPart =
    center.elevators != null && center.elevators > 0 && center.totalArea != null
      ? scale(center.totalArea / center.elevators, 12000, 3000)
      : null;
  const acPart =
    center.airConditioning == null
      ? null
      : center.airConditioning === 'full'
        ? 100
        : center.airConditioning === 'partial'
          ? 60
          : 0;
  return averageKnown([classPart, ceilingPart, elevatorPart, acPart]);
}

function parkingScore(center: BusinessCenter): number | null {
  // 2 маш./100 м² — норматив, выше которого парковка перестаёт быть
  // проблемой; ноль — её фактически нет.
  return center.parkingRatio == null ? null : scale(center.parkingRatio, 0, 2);
}

function infraScore(center: BusinessCenter): number | null {
  if (center.infraInternal.length === 0 && center.infraNearby.length === 0) return null;
  // Всего в словаре источника 8 позиций (кафе, магазин, банк, кофепоинт,
  // банкомат, фитнес, конференц-зал, салон красоты). Внутри здания весит
  // больше, чем рядом: до кафе в своём холле идти не надо.
  const internal = scale(center.infraInternal.length, 0, 5);
  const nearby = scale(center.infraNearby.length, 0, 6);
  return internal * 0.65 + nearby * 0.35;
}

function marketScore(center: BusinessCenter, offers: CatalogOfferIndex): number | null {
  const hasRent = offers.rentBySlug.has(center.slug);
  const hasSale = offers.saleBySlug.has(center.slug);
  const lotsPart = hasRent && hasSale ? 100 : hasRent || hasSale ? 70 : 0;
  // Рейтинг 2ГИС входит в индекс как ФАКТ о здании (он есть у 47 из 143),
  // но не как усреднённая оценка: шкала 3,5→5 линейная, отсутствие
  // рейтинга не штрафует.
  const ratingPart = center.gisRating == null ? null : scale(center.gisRating, 3.5, 5);
  return averageKnown([lotsPart, ratingPart]);
}

export function businessCenterIndex(center: BusinessCenter, offers: CatalogOfferIndex): BusinessCenterIndex | null {
  const raw: { key: SubscaleKey; score: number | null }[] = [
    { key: 'location', score: locationScore(center) },
    { key: 'building', score: buildingScore(center) },
    { key: 'parking', score: parkingScore(center) },
    { key: 'infra', score: infraScore(center) },
    { key: 'market', score: marketScore(center, offers) },
  ];
  const known = raw.filter((r): r is { key: SubscaleKey; score: number } => r.score != null);
  if (known.length < MIN_INDEX_SUBSCALES) return null;

  // Вес отсутствующих подшкал перераспределяется на известные — иначе
  // здание без данных по парковке теряло бы 15 баллов «за незнание».
  const totalWeight = known.reduce((sum, r) => sum + SUBSCALE_META[r.key].weight, 0);
  const value = known.reduce((sum, r) => sum + r.score * SUBSCALE_META[r.key].weight, 0) / totalWeight;

  return {
    value: Math.round(value),
    subscales: known.map((r) => ({ key: r.key, score: Math.round(r.score) })),
    known: known.length,
  };
}

// Индексы по всему каталогу разом — чтобы сортировать и показывать ранг,
// не пересчитывая по одному зданию на каждый рендер.
export function buildIndexMap(
  centers: BusinessCenter[],
  offers: CatalogOfferIndex,
): Map<string, BusinessCenterIndex> {
  const map = new Map<string, BusinessCenterIndex>();
  for (const c of centers) {
    const idx = businessCenterIndex(c, offers);
    if (idx) map.set(c.slug, idx);
  }
  return map;
}
