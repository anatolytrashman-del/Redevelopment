import { describe, expect, it } from 'vitest';
import {
  matchCatalogNavigation,
  matchCatalogOffer,
  normalizeSearch,
} from './productSearch';
import type { SupplierOffer } from '../../data/supplierResearch';
import type { SupplierSiteSnapshot } from '../../data/supplierSiteSnapshots';

function offer(partial: Partial<SupplierOffer> = {}): SupplierOffer {
  return {
    id: 'o1',
    requestId: 'r1',
    name: 'Краски Здесь',
    contact: '+7 900 111-22-33',
    contactMethod: 'Телефон',
    email: 'sales@kraski.example',
    managerName: 'Иван',
    country: 'Россия',
    websiteUrl: 'https://kraski.example',
    listingUrl: '',
    contactSource: '',
    messengers: [],
    catalogModelName: '',
    catalogModelPhoto: null,
    price: 0,
    currency: 'RUB',
    items: [],
    files: [],
    shortCode: 'abc12',
    verified: true,
    inn: '7707083893',
    queueSnoozedAt: null,
    termsNote: '',
    createdAt: '2026-01-01',
    outcome: null,
    outcomeAt: null,
    reminderStage: 0,
    reminderSentAt: null,
    emailInvalidAt: null,
    emailInvalidReason: null,
    terms: null,
    supplierId: 's1',
    ...partial,
  } as SupplierOffer;
}

function snap(partial: Partial<SupplierSiteSnapshot> = {}): SupplierSiteSnapshot {
  return {
    host: 'kraski.example',
    websiteUrl: 'https://kraski.example',
    status: 'done',
    pageTitle: 'Краски',
    metaDescription: 'Интерьерные краски Tikkurila',
    sections: [{ title: 'Керамогранит', url: 'https://kraski.example/tile' }],
    error: null,
    fetchedAt: null,
    categories: ['Краски и ЛКМ'],
    categoriesNote: '',
    classifiedAt: null,
    categoriesVerified: true,
    categoriesVerifiedAt: null,
    ...partial,
  };
}

describe('matchCatalogOffer', () => {
  const snapshots = new Map([['kraski.example', snap()]]);

  it('находит по имени', () => {
    const { match } = matchCatalogOffer(offer(), snapshots, normalizeSearch('краски'), 'Краски', undefined);
    expect(match.matched).toBe(true);
    expect(match.byName).toBe(true);
  });

  it('находит по ИНН', () => {
    const { match } = matchCatalogOffer(offer(), snapshots, '7707083893', undefined, undefined);
    expect(match.kinds).toContain('inn');
  });

  it('находит по email', () => {
    const { match } = matchCatalogOffer(offer(), snapshots, 'sales@kraski', undefined, undefined);
    expect(match.kinds).toContain('email');
  });

  it('находит по бренду из hints', () => {
    const { match } = matchCatalogOffer(
      offer({ name: 'ООО Поставка' }),
      snapshots,
      normalizeSearch('ceresit'),
      undefined,
      { kind: null, ownBrands: [], resoldBrands: ['Ceresit'], productKinds: [], inn: null, email: '', phone: '' },
    );
    expect(match.kinds).toContain('brand');
    expect(match.reason).toMatch(/Ceresit/i);
  });

  it('находит по разделу сайта', () => {
    const { match } = matchCatalogOffer(
      offer({ name: 'Другая фирма' }),
      snapshots,
      normalizeSearch('керамогранит'),
      undefined,
      undefined,
    );
    expect(match.kinds).toContain('site');
    expect(match.hits.length).toBeGreaterThan(0);
  });
});

describe('matchCatalogNavigation', () => {
  it('находит плитку по названию категории', () => {
    const hits = matchCatalogNavigation(normalizeSearch('керамогранит'));
    expect(hits.some((h) => h.kind === 'category' && /керамогранит/i.test(h.label))).toBe(true);
  });
});
