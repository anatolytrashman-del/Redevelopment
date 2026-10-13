import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Supplier } from '../data/suppliers';
import type { SupplierOffer } from '../data/supplierResearch';
import type { SupplierOfferEmail } from '../data/supplierOfferEmails';
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
  preferred: false,
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

function render(
  company: Supplier,
  tab = 'overview',
  extra?: { offers?: SupplierOffer[]; emails?: SupplierOfferEmail[] },
) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/admin/suppliers/supplier?tab=${tab}`]}>
      <SupplierDetailView
        supplier={company}
        offers={extra?.offers ?? []}
        requests={[]}
        snapshot={null}
        reliability={null}
        contacts={[]}
        emails={extra?.emails ?? []}
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

  it('keeps the mailbox we write to and addresses from real mail, and hides the rest of the site', () => {
    const html = render(
      {
        ...supplier,
        siteProfile: {
          contacts: {
            emails: [
              { email: 'sales@example.ru', label: 'Продажи' },
              { email: 'samara@example.ru', label: 'Самара' },
              { email: 'boss@example.ru', label: 'Директор' },
            ],
          },
        },
      },
      'overview',
      {
        emails: [
          {
            direction: 'in',
            fromAddress: 'Boss <boss@example.ru>',
            toAddress: 'zakupki@redevelopment.pro',
          } as SupplierOfferEmail,
        ],
      },
    );
    expect(html).toContain('пишем сюда');
    expect(html).toContain('boss@example.ru');
    expect(html).toContain('Ещё 1 адрес с сайта');
    expect(html).not.toContain('samara@example.ru');
  });

  it('shows the INN from an invoice when the company record does not have one yet', () => {
    const html = render({ ...supplier, inn: '' }, 'overview', {
      offers: [{ id: 'offer', inn: '7736192449' } as SupplierOffer],
    });
    expect(html).toContain('7736192449');
    expect(html).toContain('ИНН из счёта');
    expect(html).not.toContain('ИНН появится из первого счёта');
  });
});
