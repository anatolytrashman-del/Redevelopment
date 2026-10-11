import { normalizeSearch } from './productSearch';
import type { SupplierOffer } from '../../data/supplierResearch';
import type { SupplierQuote } from '../../data/supplierQuotes';
import type { PurchaseItem } from '../../data/purchases';

// Поиск «кто уже возил позицию» (владелец, 2026-10-09): по названиям строк
// из КП и из карточки предложения. Возвращает совпавшие названия для подписи.

function itemNames(items: PurchaseItem[]): string[] {
  return items.map((i) => i.name).filter(Boolean);
}

export function buildCarriedItemIndex(
  offers: SupplierOffer[],
  quotes: SupplierQuote[],
): Map<string, string[]> {
  // Ключ — offerId; значение — уникальные названия позиций, которые у него были.
  const byOffer = new Map<string, Set<string>>();
  const add = (offerId: string, names: string[]) => {
    let set = byOffer.get(offerId);
    if (!set) {
      set = new Set();
      byOffer.set(offerId, set);
    }
    for (const n of names) {
      const t = n.trim();
      if (t) set.add(t);
    }
  };

  for (const o of offers) add(o.id, itemNames(o.items));
  for (const q of quotes) add(q.offerId, itemNames(q.items));

  const out = new Map<string, string[]>();
  for (const [id, set] of byOffer) out.set(id, [...set]);
  return out;
}

// Предложение (и все карточки той же компании) несут позицию, имя которой
// содержит query. query — уже normalizeSearch.
export function matchCarriedPosition(
  offer: SupplierOffer,
  allOffers: SupplierOffer[],
  carriedByOffer: Map<string, string[]>,
  query: string,
): { matched: boolean; itemName: string | null } {
  if (!query) return { matched: false, itemName: null };
  const companyIds =
    offer.supplierId != null
      ? allOffers.filter((o) => o.supplierId === offer.supplierId).map((o) => o.id)
      : [offer.id];
  for (const id of companyIds) {
    for (const name of carriedByOffer.get(id) ?? []) {
      if (normalizeSearch(name).includes(query)) {
        return { matched: true, itemName: name };
      }
    }
  }
  return { matched: false, itemName: null };
}

// Бренды компаний в выборке — для чипов-фильтров внутри плитки.
export function brandsInSuppliers(
  suppliers: SupplierOffer[],
  hintsById: Map<string, { ownBrands: string[]; resoldBrands: string[] }>,
): { brand: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const o of suppliers) {
    if (!o.supplierId) continue;
    const h = hintsById.get(o.supplierId);
    if (!h) continue;
    const seen = new Set<string>();
    for (const b of [...h.ownBrands, ...h.resoldBrands]) {
      const name = b.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand, 'ru'));
}

export function supplierHasBrand(
  offer: SupplierOffer,
  brand: string,
  hintsById: Map<string, { ownBrands: string[]; resoldBrands: string[] }>,
): boolean {
  if (!offer.supplierId) return false;
  const h = hintsById.get(offer.supplierId);
  if (!h) return false;
  const needle = brand.toLowerCase();
  return [...h.ownBrands, ...h.resoldBrands].some((b) => b.trim().toLowerCase() === needle);
}
