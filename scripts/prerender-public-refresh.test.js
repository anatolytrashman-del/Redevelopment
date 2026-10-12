import { describe, expect, it } from 'vitest';
import {
  isTradeCenterCardPath,
  needsHonestPublicRefresh,
} from './prerender-public-refresh.mjs';

const opts = {
  landingPathSet: new Set(['minsk/one']),
  alwaysFullPaths: new Set(['', 'minsk/tc', 'minsk/bc']),
  staticPaths: ['privacy', 'minsk'],
};

describe('isTradeCenterCardPath', () => {
  it('карточка слага', () => {
    expect(isTradeCenterCardPath('minsk/tc/zamok')).toBe(true);
  });
  it('корень / вложенные хабы / store — не карточки; односегментный хаб совпадает со слагом', () => {
    expect(isTradeCenterCardPath('minsk/tc')).toBe(false);
    expect(isTradeCenterCardPath('minsk/tc/store/food')).toBe(false);
    expect(isTradeCenterCardPath('minsk/tc/rating/largest')).toBe(false);
    // односегментный путь — та же форма, что у карточки (rating и zamok)
    expect(isTradeCenterCardPath('minsk/tc/rating')).toBe(true);
  });
});

describe('needsHonestPublicRefresh', () => {
  it('карточки ТЦ честно рендерим (иначе старый HTML + новый JS мигает)', () => {
    expect(needsHonestPublicRefresh('minsk/tc/zamok', opts)).toBe(true);
    expect(needsHonestPublicRefresh('minsk/tc/galleria-minsk', opts)).toBe(true);
  });
  it('хабы ТЦ — да, store — нет, раздел БЦ — нет', () => {
    expect(needsHonestPublicRefresh('minsk/tc', opts)).toBe(true);
    expect(needsHonestPublicRefresh('minsk/tc/rating/largest', opts)).toBe(true);
    expect(needsHonestPublicRefresh('minsk/tc/store/food', opts)).toBe(false);
    expect(needsHonestPublicRefresh('minsk/bc/zamok', opts)).toBe(false);
    expect(needsHonestPublicRefresh('minsk/bc', opts)).toBe(false);
  });
  it('лендинги и статика — да', () => {
    expect(needsHonestPublicRefresh('minsk/one', opts)).toBe(true);
    expect(needsHonestPublicRefresh('privacy', opts)).toBe(true);
    expect(needsHonestPublicRefresh('minsk', opts)).toBe(true);
  });
});
