import { describe, expect, it } from 'vitest';
import { groupProductKindsByCatalog } from './groupProductKinds';

describe('groupProductKindsByCatalog', () => {
  it('раскладывает виды по плиткам каталога', () => {
    const groups = groupProductKindsByCatalog([
      'краска фасадная',
      'керамогранит 60x60',
      'плинтус напольный',
      'непонятная штуковина xyz',
    ]);
    const names = groups.map((g) => g.category);
    expect(names.some((n) => /краск|обои|декор/i.test(n))).toBe(true);
    expect(names.some((n) => /керамогранит|плитк/i.test(n))).toBe(true);
    expect(names).toContain('Прочее');
  });

  it('не дублирует одинаковые виды', () => {
    const groups = groupProductKindsByCatalog(['Ламинат', 'ламинат', 'Ламинат ']);
    const all = groups.flatMap((g) => g.kinds);
    expect(all).toHaveLength(1);
  });
});
