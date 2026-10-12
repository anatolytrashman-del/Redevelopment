import { describe, expect, it } from 'vitest';
import { nearestShelfScrollLeft } from './appleShelfScroll';

function mockShelf(opts: {
  scrollLeft: number;
  clientWidth: number;
  paddingLeft?: number;
  cards: Array<{ offsetLeft: number; width: number }>;
}): HTMLElement {
  const pad = opts.paddingLeft ?? 0;
  const last = opts.cards.at(-1);
  const scrollWidth = Math.max(
    opts.clientWidth,
    (last?.offsetLeft ?? 0) + (last?.width ?? 0) + pad,
  );
  const children = opts.cards.map((card) => ({ offsetLeft: card.offsetLeft }));
  return {
    scrollLeft: opts.scrollLeft,
    clientWidth: opts.clientWidth,
    scrollWidth,
    children,
    style: { paddingLeft: `${pad}px` },
  } as unknown as HTMLElement;
}

describe('nearestShelfScrollLeft', () => {
  it('тянет к ближайшей карточке', () => {
    const el = mockShelf({
      scrollLeft: 90,
      clientWidth: 320,
      paddingLeft: 4,
      cards: [
        { offsetLeft: 4, width: 120 },
        { offsetLeft: 134, width: 120 },
        { offsetLeft: 264, width: 120 },
        { offsetLeft: 394, width: 120 },
      ],
    });
    // edge = 90+4=94 → ближе к 134, чем к 4 → scrollLeft = 134-4 = 130
    expect(nearestShelfScrollLeft(el)).toBe(130);
  });

  it('не уходит за max scroll', () => {
    const el = mockShelf({
      scrollLeft: 500,
      clientWidth: 200,
      paddingLeft: 0,
      cards: [
        { offsetLeft: 0, width: 100 },
        { offsetLeft: 110, width: 100 },
        { offsetLeft: 220, width: 100 },
      ],
    });
    // scrollWidth=320, max=120
    expect(nearestShelfScrollLeft(el)).toBe(120);
  });
});
