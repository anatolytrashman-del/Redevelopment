import { describe, expect, it } from 'vitest';
import themes from './__fixtures__/tradeCenterFactsReviews/galleria-reviews.json';
import facts from './__fixtures__/tradeCenterFactsReviews/galleria-facts.json';
import { moreFactsLabel, reviewThemeColumns, reviewThemeWidth, reviewThemesFaq, yandexReviewsUrl } from './tradeCenterFactsReviews';
import { normalizeRetailInfo, retailSectionIds } from './tradeCenterRetail';

describe('факты и темы отзывов ТЦ', () => {
  it.each([[1, 'факт'], [2, 'факта'], [4, 'факта'], [5, 'фактов'], [11, 'фактов'], [12, 'фактов'], [21, 'факт'], [24, 'факта'], [111, 'фактов']])('склоняет %i', (n, word) => {
    expect(moreFactsLabel(Number(n))).toBe(`Ещё ${n} ${word}`);
  });

  it('считает полоски относительно максимума обеих колонок', () => {
    expect(reviewThemeWidth(40, themes)).toBe(100);
    expect(reviewThemeWidth(5, themes)).toBe(12.5);
    const complaintsLead = { ...themes, complaints: [{ theme: 'Очереди', share: 80 }] };
    expect(reviewThemeWidth(40, complaintsLead)).toBe(50);
    expect(reviewThemeWidth(0, { ...themes, praise: [], complaints: [] })).toBe(0);
    expect(reviewThemeWidth(0, { ...themes, praise: [{ theme: 'Тема', share: 0 }], complaints: [] })).toBe(0);
  });

  it('не выводит пустые колонки', () => {
    expect(reviewThemeColumns(themes).map((c) => c.title)).toEqual(['Хвалят', 'Жалуются']);
    expect(reviewThemeColumns({ ...themes, praise: [] }).map((c) => c.title)).toEqual(['Жалуются']);
    expect(reviewThemeColumns({ ...themes, complaints: [] }).map((c) => c.title)).toEqual(['Хвалят']);
    expect(reviewThemeColumns({ ...themes, praise: [], complaints: [] })).toEqual([]);
  });

  it('составляет FAQ из трёх похвал и двух жалоб с наибольшей долей', () => {
    expect(reviewThemesFaq({ ...themes, praise: [...themes.praise].reverse() })).toBe(
      'Хвалят: Удобное расположение (40%); Современный дизайн интерьера (38%); Большой выбор магазинов (38%). Жалуются: Очереди в туалеты (5%); Много молодежи и подростков (4%).',
    );
    expect(reviewThemesFaq({ ...themes, praise: [], complaints: [] })).toBeNull();
    expect(reviewThemesFaq({ ...themes, praise: [], complaints: [{ theme: 'Очереди', share: 0 }] })).toBe('Жалуются: Очереди (0%).');
  });

  it('разбирает реальные данные Galleria и сохраняет явный пустой массив фактов', () => {
    expect(normalizeRetailInfo({ factCards: facts, reviewThemes: themes })).toMatchObject({ factCards: facts, reviewThemes: themes });
    expect(normalizeRetailInfo({ factCards: [] })?.factCards).toEqual([]);
    expect(normalizeRetailInfo({ tenantsAt: { slug: 'test', name: 'ТЦ' } })?.factCards).toBeNull();
    expect(normalizeRetailInfo({})).toBeNull();
  });

  it('отбрасывает некорректные данные и сохраняет нулевые доли', () => {
    const info = normalizeRetailInfo({ factCards: [{ headline: '', text: 'x' }], reviewThemes: { ...themes, praise: [{ theme: 'Ноль', share: 0 }, { theme: 'Ошибка', share: 101 }, { theme: '', share: 5 }] } });
    expect(info?.factCards).toEqual([]);
    expect(info?.reviewThemes?.praise).toEqual([{ theme: 'Ноль', share: 0 }]);
  });

  it('убирает старый раздел цитат при наличии тем', () => {
    const info = normalizeRetailInfo({ reviewThemes: themes, quotes: [{ who: 'Автор', text: 'Цитата' }] })!;
    expect(retailSectionIds(info)).not.toContain('quotes');
    expect(retailSectionIds({ ...info, reviewThemes: null })).toContain('quotes');
  });
});

it('использует только имеющуюся ссылку на карточку Яндекса', () => {
  expect(yandexReviewsUrl('https://yandex.by/maps/org/galleria/123/reviews/')).toBe('https://yandex.by/maps/org/galleria/123/reviews/');
  for (const value of [null, '', 'javascript:alert(1)', 'https://example.com/maps/org/1', 'https://yandex.ru/maps/']) expect(yandexReviewsUrl(value)).toBeUndefined();
});
