// Путеводитель по ТЦ (владелец, 2026-09-25): слияние «Что на каком этаже» и
// «Каталог арендаторов» в один блок для ТЦ (TradeCenterGuide.tsx). БЦ этот
// файл не касается — каталог там остаётся прежним (TenantDirectory).
//
// Чистые функции здесь, а не в компоненте, — тем же пользуется тест
// (tradeCenterGuide.test.ts) без рендера React.
import type { RetailFloorEntry } from '../data/businessCenters';
import type { TenantOrganizationView } from '../data/businessCenterTenants';
import { tenantDirectionLabel } from '../data/tenantIndustries';
import { floorSortKey, formatFloorBadge, formatFloorLabel } from './tradeCenterRetail';

/** Псевдо-этаж для организаций без известного этажа — идёт в конце стопки. */
export const NO_FLOOR = '__no_floor__';

export interface GuideOrg extends TenantOrganizationView {
  direction: string;
}

export function toGuideOrgs(organizations: TenantOrganizationView[]): GuideOrg[] {
  return organizations.map((org) => ({ ...org, direction: tenantDirectionLabel(org.industry) }));
}

/** Этажи сверху вниз: объединение floorsGuide и этажей организаций. */
export function collectFloors(floorsGuide: RetailFloorEntry[], organizations: GuideOrg[]): string[] {
  const set = new Set<string>();
  for (const entry of floorsGuide) set.add(entry.floor);
  for (const org of organizations) if (org.floor) set.add(org.floor);
  return [...set].sort((a, b) => {
    const ka = floorSortKey(a);
    const kb = floorSortKey(b);
    if (ka == null && kb == null) return 0;
    if (ka == null) return 1;
    if (kb == null) return -1;
    return kb - ka;
  });
}

export function countByFloor(organizations: GuideOrg[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const org of organizations) {
    const key = org.floor ?? NO_FLOOR;
    if (org.floor) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Есть ли хоть одна организация без этажа — псевдо-этаж рисуем только тогда. */
export function hasUnplacedOrgs(organizations: GuideOrg[]): boolean {
  return organizations.some((org) => !org.floor);
}

/** По умолчанию — этаж с максимумом организаций, иначе первый в стопке. */
export function defaultFloor(floors: string[], counts: Map<string, number>): string | null {
  if (!floors.length) return null;
  let best = floors[0];
  let bestCount = counts.get(best) ?? 0;
  for (const floor of floors) {
    const count = counts.get(floor) ?? 0;
    if (count > bestCount) {
      best = floor;
      bestCount = count;
    }
  }
  return best;
}

/** Заголовок панели этажа: «2 этаж», «Подземный уровень −1», «Этаж не указан». */
export function floorHeading(floor: string): string {
  if (floor === NO_FLOOR) return 'Этаж не указан';
  const key = floorSortKey(floor);
  if (key != null && key < 0) return `Подземный уровень ${formatFloorBadge(floor)}`;
  return formatFloorLabel(floor);
}

/** Короткая подпись плашки в стопке этажей. */
export function floorPillLabel(floor: string): string {
  return floor === NO_FLOOR ? '?' : formatFloorBadge(floor);
}

function upperFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** Текст floorsGuide для этажа — все записи по нему, с заглавной буквы. */
export function floorGuideText(floorsGuide: RetailFloorEntry[], floor: string): string | null {
  const texts = floorsGuide.filter((entry) => entry.floor === floor).map((entry) => entry.text.trim());
  if (!texts.length) return null;
  return upperFirst(texts.join(' '));
}

export interface GuideCategoryGroup {
  direction: string;
  count: number;
  orgs: GuideOrg[];
}

/** Организации этажа, сгруппированные по направлению: по числу убыв., внутри — по алфавиту. */
export function groupByCategory(orgs: GuideOrg[]): GuideCategoryGroup[] {
  const map = new Map<string, GuideOrg[]>();
  for (const org of orgs) {
    const list = map.get(org.direction) ?? [];
    list.push(org);
    map.set(org.direction, list);
  }
  return [...map.entries()]
    .map(([direction, list]) => ({
      direction,
      count: list.length,
      orgs: [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    }))
    .sort((a, b) => b.count - a.count || a.direction.localeCompare(b.direction, 'ru'));
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

export function matchesQuery(name: string, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return false;
  return normalizeSearchText(name).includes(q);
}

/** До 8 совпадений по имени для выпадашки поиска. */
export function searchOrganizations(orgs: GuideOrg[], query: string, limit = 8): GuideOrg[] {
  if (!normalizeSearchText(query)) return [];
  return orgs.filter((org) => matchesQuery(org.name, query)).slice(0, limit);
}

export interface GuideMatrixRow {
  direction: string;
  counts: Record<string, number>;
  total: number;
}

export interface GuideMatrix {
  floors: string[]; // низ → верх, слева направо
  rows: GuideMatrixRow[];
  otherCount: number;
}

const MATRIX_MAX_CATEGORIES = 10;

/** Таблица «Категории × этажи»: топ-10 направлений + «Другое», этажи снизу вверх. */
export function buildMatrix(orgs: GuideOrg[], floorsTopDown: string[]): GuideMatrix {
  const floors = [...floorsTopDown].filter((f) => f !== NO_FLOOR).reverse();
  const withFloor = orgs.filter((org) => org.floor);
  const groups = groupByCategory(withFloor);
  const top = groups.slice(0, MATRIX_MAX_CATEGORIES);
  const rest = groups.slice(MATRIX_MAX_CATEGORIES);
  const rows: GuideMatrixRow[] = top.map((group) => {
    const counts: Record<string, number> = {};
    for (const org of group.orgs) {
      if (!org.floor) continue;
      counts[org.floor] = (counts[org.floor] ?? 0) + 1;
    }
    return { direction: group.direction, counts, total: group.count };
  });
  const otherCount = rest.reduce((sum, group) => sum + group.count, 0);
  if (otherCount > 0) {
    const counts: Record<string, number> = {};
    for (const group of rest) {
      for (const org of group.orgs) {
        if (!org.floor) continue;
        counts[org.floor] = (counts[org.floor] ?? 0) + 1;
      }
    }
    rows.push({ direction: 'Другое', counts, total: otherCount });
  }
  return { floors, rows, otherCount };
}
