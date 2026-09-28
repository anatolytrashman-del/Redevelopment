import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Supplier } from '../data/suppliers';
import { SupplierDetailView } from './SupplierDetail';

const supplier: Supplier = {
  id: 'supplier',
  name: 'Завод',
  websiteHost: 'example.ru',
  websiteUrl: 'https://example.ru',
  inn: '1234567890',
  country: 'Россия',
  city: '',
  email: 'sales@example.ru',
  phone: '',
  messengers: [],
  termsNote: '',
  verified: true,
  createdAt: '2026-09-01',
  deletedAt: null,
  blockedReason: null,
  blockedAt: null,
  supplierKind: 'manufacturer',
  ownBrands: [],
  articlePrefixes: [],
  productKinds: [],
  resoldBrands: [],
  profileNote: '',
  profiledAt: '2026-09-28',
  siteProfile: null,
};

function render(company: Supplier, tab = 'overview') {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/admin/suppliers/supplier?tab=${tab}`]}>
      <SupplierDetailView
        supplier={company}
        offers={[]}
        requests={[]}
        snapshot={null}
        reliability={null}
        contacts={[]}
        emails={[]}
        quotes={[]}
        checks={[]}
        orderCount={0}
        onSupplierChange={() => {}}
        onContactsChange={() => {}}
      />
    </MemoryRouter>,
  );
}

describe('SupplierDetailView', () => {
  it('keeps old contacts links working on the overview without a site profile', () => {
    const html = render(supplier, 'contacts');
    expect(html).toContain('Что поставляет');
    expect(html).toContain('Контактные лица');
    expect(html).toContain('Наша история');
    expect(html).toContain('Копировать sales@example.ru');
  });

  it('renders partial profiles and deduplicates the primary email', () => {
    const html = render({
      ...supplier,
      siteProfile: {
        contacts: { emails: [{ email: 'SALES@example.ru', label: 'Продажи' }, { email: 'info@example.ru' }] },
      },
    });
    expect(html).toContain('Что производит сам');
    expect(html).toContain('пишем сюда');
    expect(html).toContain('Продажи');
    expect(html.match(/aria-label="Копировать sales@example.ru"/g)).toHaveLength(1);
    expect(html).not.toContain('Копировать SALES@example.ru');
    expect(html).toContain('Производство: адрес на сайте не указан');
  });

  it('shows catalog attributes but never prices present in raw site data', () => {
    const product = {
      name: 'Краска',
      brand: 'Марка',
      article: 'KF0001',
      unit: 'кг',
      price: 987654321,
      currency: 'RUB',
    };
    const html = render({ ...supplier, siteProfile: { products: [product] } }, 'catalog');
    for (const value of ['Краска', 'Марка', 'KF0001', 'кг']) expect(html).toContain(value);
    expect(html).not.toContain('987654321');
    expect(html).not.toContain('<th class="px-3 py-2 font-medium">Цена');
  });

  it('shows an empty catalog for legacy suppliers', () => {
    expect(render(supplier, 'catalog')).toContain('Каталог с сайта ещё не собран');
  });
});
