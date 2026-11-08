import { describe, expect, it } from 'vitest';
import { isCatalogSectionPath } from './catalogNavActive';

describe('isCatalogSectionPath', () => {
  it('корень malllist совпадает со снапшотом хаба', () => {
    expect(isCatalogSectionPath('/', '/minsk/tc', 'malls')).toBe(true);
    expect(isCatalogSectionPath('/minsk/tc', '/minsk/tc', 'malls')).toBe(true);
    expect(isCatalogSectionPath('/minsk/tc/rating', '/minsk/tc', 'malls')).toBe(true);
  });

  it('корень officelist не меняет подсветку', () => {
    expect(isCatalogSectionPath('/', '/minsk/bc', 'offices')).toBe(false);
    expect(isCatalogSectionPath('/minsk/bc', '/minsk/bc', 'offices')).toBe(true);
  });
});
