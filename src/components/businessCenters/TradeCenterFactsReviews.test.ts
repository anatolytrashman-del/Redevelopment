import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { TradeCenterFactCards } from './TradeCenterFactCards';
import { TradeCenterReviewThemes } from './TradeCenterReviewThemes';
import themes from '../../lib/__fixtures__/tradeCenterFactsReviews/galleria-reviews.json';

it('показывает шесть фактов, остальные доступны по кнопке', () => {
  const facts = Array.from({ length: 10 }, (_, n) => ({ headline: `Факт ${n + 1}`, text: 'Пояснение' }));
  const html = renderToStaticMarkup(createElement(TradeCenterFactCards, { facts }));
  expect(html.match(/<h3/g)).toHaveLength(6);
  expect(html).toContain('Ещё 4 факта');
  expect(html).not.toContain('Факт 7');
  expect(renderToStaticMarkup(createElement(TradeCenterFactCards, { facts: [] }))).toBe('');
  expect(renderToStaticMarkup(createElement(TradeCenterFactCards, { facts: facts.slice(0, 1) }))).not.toContain('<button');
});

it('скрывает блок при малой выборке и пустых темах', () => {
  expect(renderToStaticMarkup(createElement(TradeCenterReviewThemes, { themes: { ...themes, reviews: 99 } }))).toBe('');
  expect(renderToStaticMarkup(createElement(TradeCenterReviewThemes, { themes: { ...themes, praise: [], complaints: [] } }))).toBe('');
  expect(renderToStaticMarkup(createElement(TradeCenterReviewThemes, { themes: { ...themes, reviews: 100 } }))).toContain('id="reviews"');
});

it('выводит рейтинг и общий счётчик, без краткого пересказа и методики', () => {
  const rating = { value: '4,7', totalCount: 1200, source: 'Яндекс.Карты', corpusCount: 1 };
  const html = renderToStaticMarkup(createElement(TradeCenterReviewThemes, { themes, rating, yandexUrl: 'https://yandex.by/maps/org/123/' }));
  expect(html).toContain('4,7');
  expect(html).toContain('1 200');
  expect(html).toContain('Все отзывы на Яндекс Картах');
  expect(html).not.toContain('Коротко');
  expect(html).not.toContain('Анализ сделан');
  const fallback = renderToStaticMarkup(createElement(TradeCenterReviewThemes, { themes, rating: { ...rating, totalCount: null } }));
  expect(fallback).toContain('600');
  expect(fallback).not.toContain('<a ');
  const noRating = renderToStaticMarkup(createElement(TradeCenterReviewThemes, { themes }));
  expect(noRating).toContain('Хвалят');
  expect(noRating).toContain('По отзывам в Яндекс Картах');
});
