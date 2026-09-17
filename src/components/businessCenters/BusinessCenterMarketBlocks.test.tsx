import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BusinessCenterOffer } from '../../data/businessCenterOffers';
import { MoneyBlock } from './BusinessCenterMarketBlocks';

const portOffer: BusinessCenterOffer = {
  id: 'port-rent', businessCenterSlug: 'port', source: 'Realt', adId: '1',
  dealType: 'rent', propertyType: 'office', size: 259.4, pricePerSqm: 13,
  floor: 0, address: null, adLink: 'https://realt.by/1', updatedAt: '2026-09-17',
};
const render = (offers: BusinessCenterOffer[] | null, error = false) =>
  renderToStaticMarkup(<MoneyBlock offers={offers} error={error} />).replace(/\u00a0/g, ' ');

describe('MoneyBlock', () => {
  it('calculates the entire actual Port lot and discloses unknown charges', () => {
    const html = render([portOffer]);
    expect(html).toContain('259,4 м²');
    expect(html).toContain('$13/м² в месяц');
    expect(html).toContain('около $3 372 в месяц по указанной ставке');
    expect(html).toContain('аренда — 1, продажа — 0');
    expect(html).toContain('этаж 0');
    expect(html).toContain('href="https://realt.by/1"');
    expect(html).toContain('Состав платежей в наших данных не раскрыт');
    for (const size of [50, 100, 200]) expect(html).not.toContain(`${size} м²`);
  });

  it('shows sale-only buildings and calculates each offer at its own rate', () => {
    const html = render([
      { ...portOffer, dealType: 'sale', size: 80, pricePerSqm: 1500 },
      { ...portOffer, id: 'sale-2', dealType: 'sale', size: 120, pricePerSqm: 2000 },
    ]);
    expect(html).toContain('аренда — 0, продажа — 2');
    expect(html).toContain('около $120 000 по указанной ставке');
    expect(html).toContain('около $240 000 по указанной ставке');
    expect(html).not.toContain('в месяц');
  });

  it('reports absence in sources only after a successful empty response', () => {
    expect(render([])).toContain('Активных предложений в наших источниках нет');
    expect(render([])).toContain('Это не означает, что в здании нет свободных помещений');
    expect(render(null)).toContain('Загружаем');
    expect(render(null, true)).toContain('Не удалось загрузить');
    expect(render(null, true)).not.toContain('Активных предложений в наших источниках нет');
  });

  it('does not replace missing lot data with a hypothetical area or rate', () => {
    const html = render([{ ...portOffer, size: 0 }]);
    expect(html).toContain('Недостаточно данных');
    expect(html).not.toContain('около $');
    expect(render([{ ...portOffer, pricePerSqm: 0 }])).toContain('около $0 в месяц');
  });
});
