import { describe, expect, it } from 'vitest';
import {
  estimateSectionHeight,
  estimateTextLines,
  planRecommendationSlots,
  recommendationPositions,
  type PageSectionSize,
} from './businessCenterPageLayout';

// Набор снят с живых страниц 2026-09-21 (Chromium 1440×900, боевые данные):
// «Порт» — длинная страница с полным набором блоков, «Пинская 28а» — бедная
// данными, «Силуэт» — та, где прошлая версия роняла две рекомендации в один
// экран (между ними оставался блок отзывов высотой 154px).
const PORT: PageSectionSize[] = [
  { id: 'offers', items: 2 },
  { id: 'tech', items: 14 },
  { id: 'map', items: 9 },
  { id: 'tenants', items: 0 },
  { id: 'market', items: 8 },
  { id: 'reviews', items: 5 },
  { id: 'awards', items: 1 },
  { id: 'media', items: 2 },
  { id: 'facts', items: 2 },
  { id: 'developer', items: 3 },
  { id: 'faq', items: 29 },
];

const PINSKAYA: PageSectionSize[] = [
  { id: 'offers', items: 2 },
  { id: 'tech', items: 8 },
  { id: 'map', items: 7 },
  { id: 'tenants', items: 0 },
  { id: 'market', items: 9 },
  { id: 'facts', items: 1 },
  { id: 'faq', items: 20 },
];

const SILUET: PageSectionSize[] = [
  { id: 'offers', items: 5 },
  { id: 'tech', items: 9 },
  { id: 'map', items: 8 },
  { id: 'tenants', items: 0 },
  { id: 'market', items: 9 },
  { id: 'reviews', items: 0 },
  { id: 'facts', items: 1 },
  { id: 'faq', items: 26 },
];

// Страница «Офисинвеста» — на ней ломалась вторая версия этой правки:
// уличный блок был в очереди, глушил общегородской, а потом сам не
// выживал после дедупа, и страница в 8 экранов оставалась с двумя
// блоками и дырой в 5 экранов.
const OFISINVEST: PageSectionSize[] = [
  { id: 'offers', items: 4 },
  { id: 'rental', items: 9 },
  { id: 'tech', items: 12 },
  { id: 'map', items: 8 },
  { id: 'tenants', items: 0 },
  { id: 'market', items: 8 },
  { id: 'reviews', items: 6 },
  { id: 'facts', items: 4 },
  { id: 'developer', items: 3 },
  { id: 'faq', items: 26 },
];

const PAGES = { PORT, PINSKAYA, SILUET, OFISINVEST };

/** Минимальный интервал, с которого два блока не видны в одном экране. */
const NOT_IN_ONE_SCREEN = 1.3;

describe('estimateTextLines', () => {
  it('считает перенос по ширине колонки и переводы строки отдельно', () => {
    expect(estimateTextLines(null, 95)).toBe(0);
    expect(estimateTextLines('коротко', 95)).toBe(1);
    expect(estimateTextLines('x'.repeat(190), 95)).toBe(2);
    expect(estimateTextLines('первая\nвторая', 95)).toBe(2);
  });
});

describe('estimateSectionHeight', () => {
  it('попадает в измеренную высоту блоков «Порта» (замер 2026-09-21)', () => {
    // Факт: faq 1390px при 29 вопросах, market 718px при 8 полосах,
    // каталог арендаторов 552px независимо от числа организаций.
    expect(estimateSectionHeight({ id: 'faq', items: 29 })).toBeCloseTo(1390 + 24, 0);
    expect(Math.abs(estimateSectionHeight({ id: 'market', items: 8 }) - 24 - 718)).toBeLessThan(60);
    expect(Math.abs(estimateSectionHeight({ id: 'tenants', items: 22 }) - 24 - 552)).toBeLessThan(30);
  });

  it('не даёт блоку с пагинацией расти от числа элементов', () => {
    expect(estimateSectionHeight({ id: 'reviews', items: 6 })).toBe(estimateSectionHeight({ id: 'reviews', items: 131 }));
  });
});

describe('planRecommendationSlots', () => {
  it('доводит блоки до низа страницы, а не заканчивает их в середине', () => {
    // Главная болезнь прошлых версий: на «Порте» все четыре блока стояли
    // выше 55% страницы, а последние 4,3 экрана шли без единого.
    const slots = planRecommendationSlots(PORT, 5);
    const anchors = PORT.filter((s) => s.id !== 'faq');
    expect(slots.length).toBeGreaterThan(1);
    expect(slots[slots.length - 1]).toBe(anchors[anchors.length - 1].id);
  });

  it('не ставит два блока в один экран', () => {
    for (const [name, page] of Object.entries(PAGES)) {
      const at = recommendationPositions(page, planRecommendationSlots(page, 5));
      for (let i = 1; i < at.length; i += 1) {
        expect(`${name}: ${(at[i] - at[i - 1]).toFixed(2)}`).toBe(`${name}: ${Math.max(at[i] - at[i - 1], NOT_IN_ONE_SCREEN).toFixed(2)}`);
      }
    }
  });

  it('не оставляет участков без рекомендаций длиннее трёх экранов', () => {
    // Порог прогона по всем 141 странице (2026-09-21): фактический
    // максимум вышел 2,88 экрана, так что три — это потолок с запасом.
    for (const [name, page] of Object.entries(PAGES)) {
      const slots = planRecommendationSlots(page, 5);
      const at = recommendationPositions(page, slots);
      // Конец обычного контента — позиция «блока», поставленного после
      // самой последней секции перед FAQ.
      const anchors = page.filter((s) => s.id !== 'faq');
      const contentEnd = recommendationPositions(page, [anchors[anchors.length - 1].id])[0];
      const marks = [0, ...at, contentEnd];
      for (let i = 1; i < marks.length; i += 1) {
        expect(`${name}: ${(marks[i] - marks[i - 1]).toFixed(2)}`).toBe(
          `${name}: ${Math.min(marks[i] - marks[i - 1], 3).toFixed(2)}`,
        );
      }
    }
  });

  it('держит интервалы близкими друг к другу, а не «два подряд и провал»', () => {
    // Перебор в planRecommendationSlots ищет не первую подошедшую
    // раскладку, а самую ровную. Прошлая жадная версия ставила блоки
    // как получится и на «Флагмане» упиралась в тупик, снимая уже
    // поставленный блок и теряя середину страницы.
    for (const page of Object.values(PAGES)) {
      const slots = planRecommendationSlots(page, 5);
      if (slots.length < 2) continue;
      const at = recommendationPositions(page, slots);
      const spread = at.slice(1).map((x, i) => x - at[i]);
      const spanOfGaps = Math.max(...spread) - Math.min(...spread);
      expect(spanOfGaps).toBeLessThan(2);
    }
  });

  it('ставит первый блок не раньше второго блока страницы', () => {
    const slots = planRecommendationSlots(PORT, 5);
    const anchors = PORT.filter((s) => s.id !== 'faq');
    expect(anchors.findIndex((s) => s.id === slots[0])).toBeGreaterThanOrEqual(1);
  });

  it('на короткой странице блоков меньше, чем на длинной', () => {
    expect(planRecommendationSlots(PINSKAYA, 5).length).toBeLessThan(planRecommendationSlots(OFISINVEST, 5).length);
  });

  it('не выдумывает блоков сверх собранных кандидатов', () => {
    expect(planRecommendationSlots(PORT, 1)).toHaveLength(1);
    expect(planRecommendationSlots(PORT, 0)).toHaveLength(0);
  });

  it('не ставит два блока после одного и того же места', () => {
    const slots = planRecommendationSlots(PORT, 5);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('переживает страницу без единого обычного блока', () => {
    expect(planRecommendationSlots([{ id: 'faq', items: 12 }], 5)).toHaveLength(0);
    expect(planRecommendationSlots([], 5)).toHaveLength(0);
  });
});
