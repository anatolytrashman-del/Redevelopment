import { describe, expect, it } from 'vitest';
import { balancedColumns, fitGridClass } from './fitGrid';

describe('balancedColumns', () => {
  it('fills rows evenly', () => {
    expect(balancedColumns(1, 3)).toBe(1);
    expect(balancedColumns(2, 5)).toBe(2);
    expect(balancedColumns(4, 3)).toBe(2);
    expect(balancedColumns(6, 5)).toBe(3);
    expect(balancedColumns(7, 5)).toBe(4);
    expect(balancedColumns(9, 3)).toBe(3);
  });
});

describe('fitGridClass', () => {
  it('never leaves two cards in a five-column grid', () => {
    expect(fitGridClass(2, 5, 'tiles')).toBe('grid-cols-2');
    expect(fitGridClass(2, 3)).toBe('grid-cols-1 sm:grid-cols-2');
    expect(fitGridClass(1, 3)).toBe('grid-cols-1');
  });
});
