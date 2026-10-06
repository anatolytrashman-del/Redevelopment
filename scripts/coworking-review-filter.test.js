import { describe, expect, it } from 'vitest';
import {
  coworkingCardStatsFromReviews,
  filterCoworkingReviews,
  isCoworkingReviewBody,
  needsCoworkingReviewFilter,
} from './coworking-review-filter.mjs';

describe('фильтр отзывов на чужой карточке', () => {
  it('Campus не режем — карточка своя', () => {
    const reviews = [{ body: 'Удобные столы, тишина, хороший кофе' }];
    expect(needsCoworkingReviewFilter('campus-coworking')).toBe(false);
    expect(filterCoworkingReviews('campus-coworking', reviews)).toEqual(reviews);
  });

  it('кинотеатр «Москва»: оставляем только про коворкинг', () => {
    expect(isCoworkingReviewBody('лучший коворкинг(из бесплатных) советую, но есть проблемы с интернетом(')).toBe(true);
    expect(isCoworkingReviewBody('Отличный кинотеатр, удобные кресла, хороший попкорн')).toBe(false);
    expect(filterCoworkingReviews('kino-moskva-coworking', [
      { body: 'лучший коворкинг(из бесплатных)' },
      { body: 'Сходили на фильм, зал тёплый' },
    ])).toEqual([{ body: 'лучший коворкинг(из бесплатных)' }]);
  });

  it('библиотека и банк без слова «коворкинг» не проходят', () => {
    expect(isCoworkingReviewBody('Прекрасное место чтобы поработать, почитать или поучиться')).toBe(false);
    expect(isCoworkingReviewBody('Шикарный современный офис с переговорками')).toBe(false);
    expect(isCoworkingReviewBody('Удобный бизнес-хаб, можно поработать с ноутбуком')).toBe(true);
  });

  it('рейтинг карточки — только по оставшимся отзывам', () => {
    expect(coworkingCardStatsFromReviews([])).toEqual({ reviewCount: 0, ratingCount: 0, rating: null });
    expect(coworkingCardStatsFromReviews([{ rating: 5 }, { rating: 5 }])).toEqual({
      reviewCount: 2,
      ratingCount: 2,
      rating: 5,
    });
  });
});
