// Б1 и Б3 плана docs/bc-catalog-redesign-plan.md — «Место на рынке» и
// соседи. Чистые вычисления без JSX: и блок на карточке БЦ, и список
// соседей считают одно и то же по одним правилам.
//
// Зачем вообще: на карточке БЦ до 2026-09-16 не было НИ ОДНОЙ сравнительной
// цифры, кроме единственной строки про медиану класса под объявлениями.
// Страница отвечала «какая тут площадь», но не «много это или мало» — то
// есть оставалась справочником. Здесь каждая цифра получает базу сравнения.
//
// Принцип «не выдумываем» здесь жёсткий: строка сравнения появляется только
// когда есть и значение здания, и база; сравнение с выборкой меньше
// MIN_COMPARE_N не показывается вовсе, а не помечается звёздочкой.
import type { BusinessCenter } from '../data/businessCenters';
import type { MarketSnapshot } from '../data/marketSnapshots';
import { nearestMetroMeters, type CatalogOfferIndex } from './businessCenterCatalogFilter';

// Меньше пяти зданий — это не «медиана класса», а случайный набор.
// Отдельный порог от MIN_RELIABLE_N (15) в marketSnapshots: там речь про
// число ОБЪЯВЛЕНИЙ в снимке рынка, здесь — про число ЗДАНИЙ в справочнике,
// и 143 записи на четыре класса просто не дают таких выборок.
export const MIN_COMPARE_N = 5;

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return Math.round(mid * 100) / 100;
}

// Место здания в ряду: 1 — лучшее. `direction` говорит, что считать
// лучшим, чтобы «1-й из 143» всегда читалось одинаково.
export function rankOf(value: number, values: number[], direction: 'desc' | 'asc'): { rank: number; total: number } {
  const sorted = [...values].sort((a, b) => (direction === 'desc' ? b - a : a - b));
  return { rank: sorted.findIndex((v) => v === value) + 1, total: sorted.length };
}

export interface ComparisonBar {
  label: string;
  unit: string;
  // Значение самого здания и базы сравнения — рисуются одной шкалой, чтобы
  // разница читалась глазами, а не вычислялась в уме.
  value: number;
  baselines: { label: string; value: number }[];
  // Пара слов для вывода: [когда меньше базы, когда больше]. Общего
  // «лучше/хуже» тут быть не может — у ставки это «дешевле/дороже», у
  // расстояния «ближе/дальше», у парковки «меньше/больше», и подставлять
  // одно слово на все метрики значит писать «на 50% дешевле до метро».
  words: [string, string];
  // Готовая фраза-вывод в духе аналитики Минск Мира: число рядом с базой и
  // тем, что из этого следует.
  note: string | null;
}

export interface MarketPosition {
  bars: ComparisonBar[];
  // «N-й из 143 по площади» и «N-й в районе» — отдельно от полосок: это
  // ранг, а не величина, полоской его рисовать нечестно.
  areaRankCity: { rank: number; total: number } | null;
  areaRankDistrict: { rank: number; total: number } | null;
}

function pct(value: number, base: number): number {
  return Math.round(Math.abs((value - base) / base) * 100);
}

function diffNote(value: number, base: number, baseLabel: string, words: [string, string]): string | null {
  if (base === 0) return null;
  const p = pct(value, base);
  if (p < 5) return `примерно на уровне ${baseLabel}`;
  return `на ${p}% ${value < base ? words[0] : words[1]}, чем ${baseLabel}`;
}

export function buildMarketPosition(
  center: BusinessCenter,
  all: BusinessCenter[],
  snapshots: MarketSnapshot[] | null,
  offers: CatalogOfferIndex,
): MarketPosition {
  const bars: ComparisonBar[] = [];
  const sameClass = center.businessClass ? all.filter((c) => c.businessClass === center.businessClass) : [];
  const sameDistrict = center.district ? all.filter((c) => c.district === center.district) : [];

  // --- Ставка аренды: здание против класса, района и города --------------
  const buildingRent = offers.rentBySlug.get(center.slug)?.median ?? null;
  if (buildingRent != null) {
    const find = (type: MarketSnapshot['sliceType'], key: string) =>
      (snapshots ?? []).find((s) => s.deal === 'rent' && s.sliceType === type && s.sliceKey === key)?.median ?? null;
    const classMedian = center.businessClass ? find('class', center.businessClass) : null;
    const districtMedian = center.district ? find('district', center.district) : null;
    const cityMedian = find('city', 'all');
    const baselines = [
      classMedian != null && center.businessClass ? { label: `класс ${center.businessClass}`, value: classMedian } : null,
      districtMedian != null && center.district ? { label: center.district, value: districtMedian } : null,
      cityMedian != null ? { label: 'город', value: cityMedian } : null,
    ].filter((b): b is { label: string; value: number } => b !== null);
    if (baselines.length > 0) {
      bars.push({
        label: 'Ставка аренды',
        unit: '$/м²',
        value: buildingRent,
        baselines,
        words: ['дешевле', 'дороже'],
        note: diffNote(buildingRent, baselines[0].value, `медиана ${baselines[0].label}`, ['дешевле', 'дороже']),
      });
    }
  }

  // --- До метро: здание против медианы класса ---------------------------
  const metro = nearestMetroMeters(center);
  if (metro != null && sameClass.length >= MIN_COMPARE_N) {
    const classMetro = median(sameClass.map(nearestMetroMeters).filter((v): v is number => v != null));
    if (classMetro != null) {
      bars.push({
        label: 'До метро',
        unit: 'м',
        value: metro,
        baselines: [{ label: `класс ${center.businessClass}`, value: classMetro }],
        words: ['ближе', 'дальше'],
        note: diffNote(metro, classMetro, `у медианного здания класса ${center.businessClass}`, ['ближе', 'дальше']),
      });
    }
  }

  // --- Парковка ---------------------------------------------------------
  if (center.parkingRatio != null && sameClass.length >= MIN_COMPARE_N) {
    const classParking = median(sameClass.map((c) => c.parkingRatio).filter((v): v is number => v != null));
    if (classParking != null) {
      bars.push({
        label: 'Парковка',
        unit: 'маш./100 м²',
        value: center.parkingRatio,
        baselines: [{ label: `класс ${center.businessClass}`, value: classParking }],
        words: ['меньше', 'больше'],
        note: diffNote(center.parkingRatio, classParking, `у медианного здания класса ${center.businessClass}`, ['меньше', 'больше']),
      });
    }
  }

  // --- Типовой этаж -----------------------------------------------------
  if (center.floorPlateArea != null && sameClass.length >= MIN_COMPARE_N) {
    const classFloor = median(sameClass.map((c) => c.floorPlateArea).filter((v): v is number => v != null));
    if (classFloor != null) {
      bars.push({
        label: 'Типовой этаж',
        unit: 'м²',
        value: center.floorPlateArea,
        baselines: [{ label: `класс ${center.businessClass}`, value: classFloor }],
        words: ['меньше', 'больше'],
        note: diffNote(center.floorPlateArea, classFloor, `у медианного здания класса ${center.businessClass}`, ['меньше', 'больше']),
      });
    }
  }

  const areasCity = all.map((c) => c.totalArea).filter((v): v is number => v != null);
  const areasDistrict = sameDistrict.map((c) => c.totalArea).filter((v): v is number => v != null);
  return {
    bars,
    areaRankCity: center.totalArea != null && areasCity.length >= MIN_COMPARE_N
      ? rankOf(center.totalArea, areasCity, 'desc')
      : null,
    areaRankDistrict:
      center.totalArea != null && areasDistrict.length >= MIN_COMPARE_N
        ? rankOf(center.totalArea, areasDistrict, 'desc')
        : null,
  };
}

export interface NeighbourCenter {
  center: BusinessCenter;
  meters: number;
}

// Соседи — по прямой от координат (Д2), не по дорожной сети: маршрутов у
// нас нет, и выдумывать «7 минут пешком» по воздуху было бы враньём.
export function nearestNeighbours(center: BusinessCenter, all: BusinessCenter[], limit = 5): NeighbourCenter[] {
  if (center.lat == null || center.lng == null) return [];
  return all
    .filter((c) => c.slug !== center.slug && c.lat != null && c.lng != null)
    .map((c) => ({ center: c, meters: haversineMeters(center.lat as number, center.lng as number, c.lat as number, c.lng as number) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);
}
