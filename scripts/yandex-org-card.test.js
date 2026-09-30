import { describe, expect, it } from 'vitest';
import { cardFromOrgHtml } from './yandex-org-card.mjs';

const html = (items) =>
  `<html><script type="application/json" class="state-view">${JSON.stringify({ stack: [{ results: { items } }] })}</script></html>`;

const own = {
  id: '100',
  title: 'ТЦ Пример',
  fullAddress: 'Минск, улица Примерная, 1',
  ratingData: { ratingCount: 1234, ratingValue: 4.600000381, reviewCount: 456 },
  status: 'open',
  workingTimeText: 'ежедневно, 10:00–22:00',
  workingTime: [[{ from: { hours: 10, minutes: 0 }, to: { hours: 22, minutes: 0 } }]],
  phones: [{ number: '+375 17 000-00-00', value: '+375170000000', type: 'phone' }],
  urls: ['https://example.by/'],
  businessLinks: [{ href: 'https://example.by/' }],
  socialLinks: [{ type: 'instagram', href: 'https://instagram.com/example', readableHref: '@example' }],
  categories: [{ name: 'Торговый центр' }],
  features: [
    { id: 'parking', name: 'парковка', value: true, type: 'bool' },
    { id: 'payment', name: 'способ оплаты', value: [{ id: 'card', name: 'картой' }], type: 'enum' },
    { id: 'empty', name: 'пусто', value: [], type: 'enum' },
  ],
  metro: [{ name: 'Немига', distanceValue: 512.4 }],
  photos: { count: 88 },
};

describe('cardFromOrgHtml', () => {
  it('берёт поля именно карточки с нужным id, не соседей', () => {
    const neighbour = { ...own, id: '200', title: 'Сосед', ratingData: { ratingValue: 3 } };
    const card = cardFromOrgHtml(html([neighbour, own]), '100');
    expect(card).toMatchObject({
      orgId: '100',
      name: 'ТЦ Пример',
      rating: 4.6,
      ratingCount: 1234,
      reviewCount: 456,
      workingTimeText: 'ежедневно, 10:00–22:00',
      sites: ['https://example.by/'],
      socialLinks: [{ type: 'instagram', href: 'https://instagram.com/example' }],
      categories: ['Торговый центр'],
      metro: [{ name: 'Немига', distanceM: 512 }],
      photoCount: 88,
    });
    expect(card.features).toEqual([
      { id: 'parking', name: 'парковка', value: true },
      { id: 'payment', name: 'способ оплаты', value: ['картой'] },
    ]);
  });

  it('нет карточки с таким id или нет state-view — null', () => {
    expect(cardFromOrgHtml(html([own]), '999')).toBeNull();
    expect(cardFromOrgHtml('<html></html>', '100')).toBeNull();
  });

  it('без рейтинга — null, а не ноль', () => {
    const card = cardFromOrgHtml(html([{ id: '100', title: 'Без оценок' }]), '100');
    expect(card).toMatchObject({ rating: null, ratingCount: null, phones: [], sites: [], features: [] });
  });
});
