import { SUPPLY_CATEGORIES } from '../../data/supplyCategories';
import { SUPPLIER_CATALOG } from '../../data/supplierCatalog';
import { normalizeSearch } from './productSearch';

// Раскладка product_kinds (свободный текст с сайта) по плиткам каталога:
// вид → товарная группа справочника → категория SUPPLIER_CATALOG.
// Нужно, чтобы на карточке поставщика «Виды товара» читались глазами
// блоками, а не одной простынёй чипов (владелец, 2026-10-09).

function supplyGroupToCatalogCategory(): Map<string, string> {
  const map = new Map<string, string>();
  for (const hub of SUPPLIER_CATALOG) {
    for (const cat of hub.categories) {
      for (const g of cat.supplyGroups) map.set(g, cat.name);
    }
  }
  return map;
}

const GROUP_TO_CAT = supplyGroupToCatalogCategory();

// «краска» ↔ «краски»: грубая стемма без морфологии — обрезаем 1–2 буквы.
function tokenHits(haystack: string, token: string): boolean {
  if (token.length < 3) return false;
  if (haystack.includes(token)) return true;
  for (const stemLen of [token.length - 1, token.length - 2]) {
    if (stemLen < 4) continue;
    if (haystack.includes(token.slice(0, stemLen))) return true;
  }
  return false;
}

function bestSupplyGroup(kind: string): string | null {
  const q = normalizeSearch(kind);
  if (!q) return null;
  let bestName: string | null = null;
  let bestScore = 0;
  for (const c of SUPPLY_CATEGORIES) {
    const name = normalizeSearch(c.name);
    const hint = normalizeSearch(c.hint);
    let score = 0;
    if (name && (q.includes(name) || name.includes(q) || tokenHits(name, q))) score += 10;
    for (const token of q.split(/\s+/).filter((t) => t.length > 2)) {
      if (tokenHits(name, token)) score += 3;
      else if (tokenHits(hint, token)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestName = c.name;
    }
  }
  return bestScore >= 3 ? bestName : null;
}

export interface ProductKindGroup {
  category: string;
  kinds: string[];
}

export function groupProductKindsByCatalog(kinds: string[]): ProductKindGroup[] {
  const byCat = new Map<string, string[]>();
  const other: string[] = [];
  const seen = new Set<string>();

  for (const raw of kinds) {
    const kind = raw.trim();
    if (!kind) continue;
    const key = kind.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const group = bestSupplyGroup(kind);
    const cat = group ? (GROUP_TO_CAT.get(group) ?? null) : null;
    if (!cat) {
      other.push(kind);
      continue;
    }
    const list = byCat.get(cat);
    if (list) list.push(kind);
    else byCat.set(cat, [kind]);
  }

  const result: ProductKindGroup[] = [];
  for (const hub of SUPPLIER_CATALOG) {
    for (const cat of hub.categories) {
      const list = byCat.get(cat.name);
      if (list?.length) result.push({ category: cat.name, kinds: list });
    }
  }
  if (other.length) result.push({ category: 'Прочее', kinds: other });
  return result;
}
