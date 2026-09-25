import type { RetailFloorEntry } from '../data/businessCenters';
import type { TenantOrganizationView } from '../data/businessCenterTenants';

export interface UniqueBrand { name: string; label: string }
interface Shop { name: string; rubric: string | null; reviewCount: number | null }

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е');
}

export function normalizeBrand(value: string): string {
  return normalizeSearchText(value).replace(/[^\p{L}\p{N}]/gu, '');
}

export function shopLabel(org: Shop): string | null {
  const rubric = normalizeSearchText(org.rubric ?? '');
  const text = `${normalizeSearchText(org.name)} ${rubric}`;
  if (normalizeBrand(org.name).length < 3 || /туалет|банкомат|банк|микрофинанс|криптомат|офис|гостиниц|отель|казино|ломбард|организаци[яи] мероприятий|перевоз|этаж\s*[-−]?\d/u.test(text)) return null;
  if (/ресторан/u.test(rubric)) return 'ресторан';
  if (/кафе|кофейн/u.test(rubric)) return 'кафе';
  if (/фастфуд|быстрого питания|пиццер|бургер|суши|столов/u.test(rubric)) return 'еда';
  if (/детск|игруш/u.test(rubric)) return 'дети';
  if (/обув/u.test(rubric)) return 'обувь';
  if (/одежд|бель[ея]|бутик/u.test(rubric)) return 'одежда';
  if (/ювелир|украшени/u.test(rubric)) return 'ювелирные';
  if (/косметик|парфюмер/u.test(rubric)) return 'косметика';
  if (/электрон|техник|компьютер|телефон/u.test(rubric)) return 'техника';
  if (/спорт/u.test(rubric)) return 'спорт';
  if (/продукт|супермаркет|гипермаркет/u.test(rubric)) return 'продукты';
  if (/развлеч|кинотеатр|боулинг|игров/u.test(rubric)) return 'развлечения';
  if (/мебель|подар|сувенир|товары для дома|посуда/u.test(rubric)) return 'дом и подарки';
  return /магазин/u.test(rubric) ? 'магазин' : null;
}

export function popularShops<T extends Shop>(orgs: T[], limit = 5): T[] {
  return orgs.filter((org) => shopLabel(org)).sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0) || a.name.localeCompare(b.name, 'ru')).slice(0, limit);
}

export function searchOrganizations(orgs: TenantOrganizationView[], query: string): TenantOrganizationView[] {
  const q = normalizeSearchText(query);
  return q ? orgs.filter((org) => normalizeSearchText(org.name).includes(q)).slice(0, 5) : [];
}

export function exactOrganization(orgs: TenantOrganizationView[], query: string): TenantOrganizationView | null {
  const exact = orgs.filter((org) => normalizeSearchText(org.name) === normalizeSearchText(query));
  return exact.length === 1 ? exact[0] : null;
}

export function nearbyOrganizations(orgs: TenantOrganizationView[], target: TenantOrganizationView): TenantOrganizationView[] {
  if (!target.floor) return [];
  return popularShops(orgs.filter((org) => org.floor === target.floor && normalizeBrand(org.name) !== normalizeBrand(target.name)), Infinity)
    .sort((a, b) => Number(b.rubric != null && b.rubric === target.rubric) - Number(a.rubric != null && a.rubric === target.rubric))
    .slice(0, 3);
}

function cleanText(text: string): string {
  return text.replace(/\([^)]*\)/gu, '').replace(/и др\.?(?![\p{L}])/giu, '').replace(/\s+/gu, ' ').replace(/\s+([,;])/gu, '$1').trim();
}
function upperFirst(text: string): string { return text.charAt(0).toUpperCase() + text.slice(1); }

export function parseFloorGuide(text: string, fallbackBrands: string[] = []): { theme: string; brands: string[] } {
  const colon = text.indexOf(':');
  if (colon >= 0) return {
    theme: upperFirst(cleanText(text.slice(0, colon))),
    brands: text.slice(colon + 1).split(/[,;]/u).map(cleanText).filter((brand) => /[\p{L}\p{N}]/u.test(brand)).slice(0, 3),
  };
  // Без двоеточия список идёт в скобках: «ювелирные салоны и часы (SOKOLOV,
  // Pandora…), бельё (…), …». Тема — две первые позиции без скобок, бренды —
  // из первых скобок; резать по символам нельзя, рвёт названия в кавычках.
  const parts = splitTopLevel(text.split(/\.\s/u)[0]).map(cleanText).filter(Boolean);
  const inner = text.match(/\(([^)]*)\)/u)?.[1] ?? '';
  const innerBrands = inner.split(/[,;]/u).map(cleanText).filter((brand) => /[\p{L}\p{N}]/u.test(brand) && !/[\d²]|занима|около/u.test(brand));
  return {
    theme: upperFirst(parts.slice(0, 2).join(', ')),
    brands: (innerBrands.length ? innerBrands : fallbackBrands).slice(0, 3),
  };
}

/** Делит по запятым верхнего уровня — запятые внутри скобок не считаются. */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) { out.push(current); current = ''; } else current += ch;
  }
  out.push(current);
  return out;
}

export interface GuideFloor { floor: string; theme: string; brands: string[] }
export function buildFloorBoard(guide: RetailFloorEntry[], orgs: TenantOrganizationView[]): GuideFloor[] {
  const groups = new Map<string, TenantOrganizationView[]>();
  for (const org of orgs) if (org.floor) groups.set(org.floor, [...(groups.get(org.floor) ?? []), org]);
  const floorNumber = (floor: string) => Number(floor.replace(/[−–]/gu, '-'));
  // Гид ограничивает торговые уровни, чтобы не добавлять башню отеля (владелец, 2026-09-25).
  let floors = guide.length ? [...new Set(guide.map((entry) => entry.floor))] : [...groups.keys()];
  if (!guide.length) {
    const dense = floors.filter((floor) => (groups.get(floor)?.length ?? 0) >= 5).map(floorNumber).filter(Number.isFinite);
    if (dense.length) floors = floors.filter((floor) => !Number.isFinite(floorNumber(floor)) || floorNumber(floor) <= Math.max(...dense));
  }
  return floors.sort((a, b) => (Number.isFinite(floorNumber(b)) ? floorNumber(b) : -Infinity) - (Number.isFinite(floorNumber(a)) ? floorNumber(a) : -Infinity)).map((floor) => {
    const onFloor = groups.get(floor) ?? [];
    const brands = popularShops(onFloor, 3).map((org) => org.name);
    const entries = guide.filter((entry) => entry.floor === floor);
    if (entries.length) return { floor, ...parseFloorGuide(entries.map((entry) => entry.text).join('; '), brands) };
    const categories = new Map<string, number>();
    for (const org of onFloor) {
      const label = shopLabel(org);
      const category = label === 'ресторан' || label === 'кафе' ? 'еда' : label === 'магазин' || !label ? 'услуги' : label;
      categories.set(category, (categories.get(category) ?? 0) + 1);
    }
    return { floor, theme: upperFirst([...categories].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([label]) => label).join(' и ')), brands };
  });
}

export function uniqueBrandsByCenter(centers: { slug: string; kind: string; organizations: Shop[] }[]): Map<string, UniqueBrand[]> {
  const malls = centers.filter((center) => center.kind === 'tc');
  const locations = new Map<string, Set<string>>();
  for (const center of malls) for (const org of center.organizations) {
    const key = normalizeBrand(org.name);
    const slugs = locations.get(key) ?? new Set<string>();
    slugs.add(center.slug);
    locations.set(key, slugs);
  }
  return new Map(malls.map((center) => {
    const seen = new Set<string>();
    const brands = popularShops(center.organizations, Infinity).filter((org) => {
      const key = normalizeBrand(org.name);
      if (seen.has(key) || locations.get(key)?.size !== 1) return false;
      seen.add(key);
      return true;
    }).slice(0, 7).map((org) => ({ name: org.name, label: shopLabel(org)! }));
    return [center.slug, brands];
  }));
}
