import { describe, expect, it } from 'vitest';
import {
  estimateSectionHeight,
  estimateTextLines,
  planRecommendationSlots,
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

/** Куда по факту попадут блоки: расстояние от верха страницы, в экранах. */
function positions(sections: PageSectionSize[], slots: string[]): number[] {
  const anchors = sections.filter((s) => s.id !== 'faq');
  const result: number[] = [];
  let offset = 470 + 24;
  let placed = 0;
  for (const section of anchors) {
    offset += estimateSectionHeight(section);
    if (slots.includes(section.id)) {
      result.push((offset + placed * 275) / 900);
      placed += 1;
    }
  }
  return result;
}

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

  it('держит интервал не меньше полутора экранов', () => {
    for (const page of [PORT, PINSKAYA, SILUET]) {
      const at = positions(page, planRecommendationSlots(page, 5));
      for (let i = 1; i < at.length; i += 1) {
        expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it('ставит первый блок не раньше второго блока страницы', () => {
    const slots = planRecommendationSlots(PORT, 5);
    const anchors = PORT.filter((s) => s.id !== 'faq');
    expect(anchors.findIndex((s) => s.id === slots[0])).toBeGreaterThanOrEqual(1);
  });

  it('на короткой странице блоков меньше, чем на длинной', () => {
    expect(planRecommendationSlots(PINSKAYA, 5).length).toBeLessThan(planRecommendationSlots(PORT, 5).length);
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
