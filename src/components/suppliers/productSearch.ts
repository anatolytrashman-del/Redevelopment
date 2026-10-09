import { findCatalogCategory, SUPPLIER_CATALOG } from '../../data/supplierCatalog';
import { supplierWebsiteHost, type SupplierOffer } from '../../data/supplierResearch';
import type { SupplierSiteSection, SupplierSiteSnapshot } from '../../data/supplierSiteSnapshots';
import type { SupplierKind } from '../../data/suppliers';

// Поиск поставщика по товару и по полям карточки (владелец, 2026-09-28 →
// 2026-10-09): разделы меню сайта, заголовок/описание снимка, плюс название,
// категория, бренд, ИНН, email, телефон, менеджер, сайт, модель. Снимки и
// карточки уже на странице — в базу поиск не ходит.

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

// Чем именно сработал поиск — для подписи в выдаче («по ИНН», «бренд…»).
export type CatalogMatchKind =
  | 'name'
  | 'category'
  | 'brand'
  | 'inn'
  | 'email'
  | 'contact'
  | 'website'
  | 'product'
  | 'site';

export interface CatalogMatch extends ProductMatch {
  kinds: CatalogMatchKind[];
  // Короткая подпись «почему в выдаче», если не имя и не разделы сайта.
  reason: string | null;
}

// Лёгкий индекс компании для поиска по брендам/видам (см. suppliersApi).
export interface SupplierCatalogHints {
  kind: SupplierKind | null;
  ownBrands: string[];
  resoldBrands: string[];
  productKinds: string[];
  inn: string | null;
  email: string;
  phone: string;
}

export function emptyHints(): SupplierCatalogHints {
  return { kind: null, ownBrands: [], resoldBrands: [], productKinds: [], inn: null, email: '', phone: '' };
}

// query — уже нормализованный normalizeSearch.
export function matchOfferProduct(
  offer: SupplierOffer,
  snapshotByHost: Map<string, SupplierSiteSnapshot>,
  query: string,
): ProductMatch {
  return matchCatalogOffer(offer, snapshotByHost, query, undefined, undefined).match;
}

function includesQuery(haystack: string, query: string): boolean {
  return haystack.length > 0 && normalizeSearch(haystack).includes(query);
}

function anyIncludes(values: string[] | undefined, query: string): string | null {
  if (!values) return null;
  for (const v of values) {
    if (includesQuery(v, query)) return v;
  }
  return null;
}

export function matchCatalogOffer(
  offer: SupplierOffer,
  snapshotByHost: Map<string, SupplierSiteSnapshot>,
  query: string,
  requestTitle: string | undefined,
  hints: SupplierCatalogHints | undefined,
): { match: CatalogMatch } {
  const kinds: CatalogMatchKind[] = [];
  let reason: string | null = null;

  const byName = includesQuery(offer.name, query);
  if (byName) kinds.push('name');

  const catalogCat = findCatalogCategory(requestTitle ?? '');
  const categoryHaystacks = [
    requestTitle ?? '',
    catalogCat?.name ?? '',
    ...(catalogCat?.supplyGroups ?? []),
    ...(catalogCat?.includes ?? []),
  ];
  if (categoryHaystacks.some((h) => includesQuery(h, query))) {
    kinds.push('category');
    if (!reason) reason = catalogCat?.name || requestTitle || 'категория';
  }

  const brandHit =
    anyIncludes(hints?.ownBrands, query) ||
    anyIncludes(hints?.resoldBrands, query) ||
    anyIncludes(hints?.productKinds, query);
  if (brandHit) {
    kinds.push('brand');
    if (!reason) reason = `бренд «${brandHit}»`;
  }

  const inn = (offer.inn ?? hints?.inn ?? '').trim();
  if (inn && normalizeSearch(inn).includes(query)) {
    kinds.push('inn');
    if (!reason) reason = `ИНН ${inn}`;
  }

  const emails = [offer.email, hints?.email ?? ''].filter(Boolean);
  if (emails.some((e) => includesQuery(e, query))) {
    kinds.push('email');
    if (!reason) reason = emails.find((e) => includesQuery(e, query)) ?? null;
  }

  const contacts = [
    offer.contact,
    offer.managerName,
    hints?.phone ?? '',
    ...offer.messengers.map((m) => `${m.type} ${m.number}`),
  ];
  if (contacts.some((c) => includesQuery(c, query))) {
    kinds.push('contact');
    if (!reason) reason = 'контакт';
  }

  const host = supplierWebsiteHost(offer.websiteUrl);
  if (
    includesQuery(offer.websiteUrl, query) ||
    includesQuery(host, query) ||
    includesQuery(offer.listingUrl, query)
  ) {
    kinds.push('website');
    if (!reason) reason = host || offer.websiteUrl;
  }

  if (includesQuery(offer.catalogModelName, query)) {
    kinds.push('product');
    if (!reason) reason = offer.catalogModelName;
  }

  const snapshot = snapshotByHost.get(host);
  const hits = (snapshot?.sections ?? []).filter((sec) => includesQuery(sec.title, query));
  const snapshotCats = anyIncludes(snapshot?.categories, query);
  const bySiteText =
    hits.length > 0 ||
    includesQuery(snapshot?.pageTitle ?? '', query) ||
    includesQuery(snapshot?.metaDescription ?? '', query) ||
    Boolean(snapshotCats);
  if (bySiteText) {
    kinds.push('site');
    if (!reason) {
      if (hits[0]) reason = hits[0].title;
      else if (snapshotCats) reason = snapshotCats;
      else reason = 'описание сайта';
    }
  }

  const matched = kinds.length > 0;
  return {
    match: {
      byName,
      hits,
      matched,
      kinds,
      reason: byName ? null : reason,
    },
  };
}

// Совпадение запроса с названием хаба или плитки каталога — чтобы «керамогранит»
// открывал не только компании, но и саму категорию.
export interface CatalogNavHit {
  kind: 'hub' | 'category';
  hubName: string;
  categoryName: string | null;
  label: string;
}

export function matchCatalogNavigation(query: string): CatalogNavHit[] {
  if (!query) return [];
  const hits: CatalogNavHit[] = [];
  for (const hub of SUPPLIER_CATALOG) {
    if (includesQuery(hub.name, query) || includesQuery(hub.description, query)) {
      hits.push({ kind: 'hub', hubName: hub.name, categoryName: null, label: hub.name });
    }
    for (const cat of hub.categories) {
      const hay = [cat.name, ...cat.supplyGroups, ...cat.includes];
      if (hay.some((h) => includesQuery(h, query))) {
        hits.push({ kind: 'category', hubName: hub.name, categoryName: cat.name, label: cat.name });
      }
    }
  }
  // Дедуп по label (одна плитка не должна появиться дважды из includes/groups).
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.kind}:${h.hubName}:${h.categoryName ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
