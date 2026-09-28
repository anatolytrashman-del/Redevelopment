import { supplierWebsiteHost, type SupplierOffer } from '../../data/supplierResearch';
import type { SupplierSiteSection, SupplierSiteSnapshot } from '../../data/supplierSiteSnapshots';

// Поиск поставщика по товару (владелец, 2026-09-28: «нужна закупка по
// керамзиту — как найти, у кого он есть»). Ищем по разделам меню сайта,
// заголовку и описанию со снимка сайта — они уже загружены на страницу для
// плиток каталога, в базу поиск не ходит. Общий для строки поиска каталога
// и рассылки по товару.

export function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е');
}

export interface ProductMatch {
  byName: boolean;
  // Разделы сайта, в названии которых встретился товар.
  hits: SupplierSiteSection[];
  // Совпало где угодно: в названии, разделах, заголовке или описании сайта.
  matched: boolean;
}

// query — уже нормализованный normalizeSearch.
export function matchOfferProduct(
  offer: SupplierOffer,
  snapshotByHost: Map<string, SupplierSiteSnapshot>,
  query: string,
): ProductMatch {
  const byName = normalizeSearch(offer.name).includes(query);
  const snapshot = snapshotByHost.get(supplierWebsiteHost(offer.websiteUrl));
  const hits = (snapshot?.sections ?? []).filter((sec) => normalizeSearch(sec.title).includes(query));
  const bySite =
    hits.length > 0 ||
    normalizeSearch(snapshot?.pageTitle ?? '').includes(query) ||
    normalizeSearch(snapshot?.metaDescription ?? '').includes(query);
  return { byName, hits, matched: byName || bySite };
}
