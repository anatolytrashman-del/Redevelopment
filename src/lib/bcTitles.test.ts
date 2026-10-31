import { describe, expect, it } from 'vitest';
import {
  BC_TITLE_MAX_CHARS,
  bcAreaPhrase,
  bcCardTitle,
  bcCatalogPhrase,
  bcClassDistrictPhrase,
  bcClassPhrase,
  bcDistrictPhrase,
  bcHasRentData,
  bcHubTitle,
  bcMetroPhrase,
  bcRatingTitle,
  bcStreetPhrase,
  withMonthIfFits,
} from './bcTitles';

// 15:00 UTC 31 октября = 18:00 по Минску; 22:30 UTC 31 октября = уже 1 ноября в Минске.
const OCT = new Date('2026-10-31T15:00:00Z');
const NOV_MINSK = new Date('2026-10-31T22:30:00Z');

describe('bcTitles — officelist titles', () => {
  it('hub titles follow the owner templates', () => {
    expect(bcHubTitle(bcCatalogPhrase(140), OCT)).toBe('140 бизнес-центров Минска — независимый обзор | октябрь 2026');
    expect(bcHubTitle(bcDistrictPhrase('Фрунзенский', 23), OCT)).toBe('23 БЦ Фрунзенского района — независимый обзор | октябрь 2026');
    expect(bcHubTitle(bcMetroPhrase('Академия наук', 5), OCT)).toBe('5 БЦ у метро Академия наук — независимый обзор | октябрь 2026');
    expect(bcHubTitle(bcStreetPhrase('ул. Хоружей', 4), OCT)).toBe('4 БЦ на ул. Хоружей — независимый обзор | октябрь 2026');
    expect(bcHubTitle(bcAreaPhrase('Комаровка', 3), OCT)).toBe('3 БЦ района Комаровка — независимый обзор | октябрь 2026');
    expect(bcHubTitle(bcClassPhrase('A', 30), OCT)).toBe('30 БЦ класса A в Минске — независимый обзор | октябрь 2026');
    expect(bcHubTitle(bcClassDistrictPhrase('A', 'Московский', 7), OCT)).toBe('7 БЦ класса A Московского района — независимый обзор | октябрь 2026');
  });

  it('month is the Minsk build month', () => {
    expect(bcHubTitle(bcCatalogPhrase(140), NOV_MINSK)).toContain('| ноябрь 2026');
  });

  it('N=1 drops the number; plural agrees', () => {
    expect(bcMetroPhrase('Уручье', 1)).toBe('БЦ у метро Уручье');
    expect(bcHubTitle(bcMetroPhrase('Уручье', 1), OCT).startsWith('БЦ у метро Уручье — ')).toBe(true);
    expect(bcCatalogPhrase(21)).toBe('21 бизнес-центр Минска');
    expect(bcCatalogPhrase(22)).toBe('22 бизнес-центра Минска');
  });

  it('special genitive/prepositional forms', () => {
    expect(bcDistrictPhrase('Великий камень', 2)).toBe('2 БЦ парка «Великий камень»');
    expect(bcStreetPhrase('Логойский тракт', 3)).toBe('3 БЦ на Логойском тракте');
  });

  it('long hub titles drop «в Минске» first', () => {
    const t = bcHubTitle('140 БЦ класса B+ с очень длинным уточнением в Минске', OCT);
    expect(t).not.toContain('в Минске');
    expect(t).toContain('независимый обзор | октябрь 2026');
  });

  it('card titles: A/B groups and length fallback', () => {
    expect(bcCardTitle('Титан', true, OCT)).toBe('БЦ Титан — независимый обзор и арендные ставки | октябрь 2026');
    expect(bcCardTitle('Титан', false, OCT)).toBe('БЦ Титан — независимый обзор | октябрь 2026');
    const long = bcCardTitle('Очень длинное название здания', true, OCT);
    expect(long.startsWith('БЦ ')).toBe(false);
    expect(long).toContain('независимый обзор и арендные ставки | октябрь 2026');
    // Здание без имени: title не начинается со строчной; ≤75 — «БЦ на …» как было.
    expect(bcCardTitle('на Жуковского, 11А', true, OCT).startsWith('БЦ на ')).toBe(true);
    expect(bcCardTitle('на Железнодорожная, 33А', true, OCT)).toMatch(/^БЦ [А-Я]/u);
  });

  it('rent rule: rent offers or rental_info.rates; sale-only is plain', () => {
    expect(bcHasRentData(1, null)).toBe(true);
    expect(bcHasRentData(0, { rates: 'от 18 $/м²' })).toBe(true);
    expect(bcHasRentData(0, { rates: '  ' })).toBe(false);
    expect(bcHasRentData(0, undefined)).toBe(false);
  });

  it('rating and Minsk-Mir titles', () => {
    expect(bcRatingTitle('Лучшие БЦ Минска классов B и C', OCT)).toBe('Лучшие БЦ Минска классов B и C — независимый рейтинг | октябрь 2026');
    expect(withMonthIfFits('Аренда офиса в Минск Мире — ставки за м², что сдаётся', OCT)).toBe(
      'Аренда офиса в Минск Мире — ставки за м², что сдаётся | октябрь 2026',
    );
    const long = 'Коммерческая недвижимость Минск Мира: цены, помещения, аналитика';
    expect(withMonthIfFits(long, OCT)).toBe(long);
    expect(BC_TITLE_MAX_CHARS).toBe(70);
  });
});

describe('officelist: SEO-бот 2026-10-31', () => {
  const oct = new Date('2026-10-20T10:00:00Z');
  it('метро Богушевича — короткое имя в title', () => {
    expect(bcHubTitle(bcMetroPhrase('Площадь Франтишка Богушевича', 11), oct)).toBe(
      '11 БЦ у метро Площадь Богушевича — независимый обзор | октябрь 2026',
    );
  });
  it('карточки длиннее 75 — укорачиваем имя объекта, ≤75 — как было', () => {
    expect(bcCardTitle('Деловой центр Мясникова 70', true, oct)).toBe('БЦ Мясникова 70 — независимый обзор и арендные ставки | октябрь 2026');
    expect(bcCardTitle('на Независимости, 186', true, oct)).toBe('БЦ Независимости, 186 — независимый обзор и арендные ставки | октябрь 2026');
    expect(bcCardTitle('на Железнодорожная, 33А', true, oct)).toBe('БЦ Железнодорожная 33А — независимый обзор и арендные ставки | октябрь 2026');
    expect(bcCardTitle('на Богдановича, 155Б', true, oct)).toBe('БЦ Богдановича, 155Б — независимый обзор и арендные ставки | октябрь 2026');
    expect(bcCardTitle('на Жуковского, 11А', true, oct)).toBe('БЦ на Жуковского, 11А — независимый обзор и арендные ставки | октябрь 2026');
    expect(bcCardTitle('На торговой набережной', true, oct).length).toBe(75);
    for (const n of ['Очень длинное название делового комплекса Северное сияние', 'Деловой центр Мясникова 70']) {
      expect(bcCardTitle(n, true, oct).length).toBeLessThanOrEqual(75);
    }
  });
});
