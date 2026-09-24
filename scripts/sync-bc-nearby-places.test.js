import { describe, expect, it } from 'vitest';
import { spanForRadius } from './sync-bc-nearby-places.mjs';

describe('окно поиска Places API', () => {
  it('по долготе окно шире, чем по широте (косинус широты Минска)', () => {
    const { latSpan, lngSpan } = spanForRadius(53.9, 500);
    expect(latSpan).toBeCloseTo(0.00898, 4);
    expect(lngSpan).toBeGreaterThan(latSpan * 1.5);
  });
});
