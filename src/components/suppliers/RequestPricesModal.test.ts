import { describe, expect, it } from 'vitest';
import { isFullMatch } from './RequestPricesModal';

describe('isFullMatch', () => {
  it('полное соответствие — закрыты все позиции', () => {
    expect(isFullMatch([0, 1, 2, 3, 4], 5)).toBe(true);
    expect(isFullMatch([0], 5)).toBe(false);
    expect(isFullMatch([], 5)).toBe(false);
  });

  it('пустая ведомость не считается полным соответствием', () => {
    expect(isFullMatch([], 0)).toBe(false);
  });
});
