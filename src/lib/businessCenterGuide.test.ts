import { describe, expect, it } from 'vitest';
import type { BusinessCenter } from '../data/businessCenters';
import type { MarketSnapshot } from '../data/marketSnapshots';
import {
  GUIDE_SEGMENT,
  classExamples,
  classProfiles,
  costExample,
  fmtPeriod,
  fmtRate,
  latestPeriod,
  rentTierSplit,
} from './businessCenterGuide';

function center(patch: Partial<BusinessCenter> & { slug: string }): BusinessCenter {
  return {
    id: patch.slug,
    name: patch.name ?? `БЦ «${patch.slug}»`,
    altNames: [],
    address: 'пр-т Независимости, 1',
    district: 'Центральный',
    microdistrict: null,
    businessClass: 'B',
    totalArea: null,
    yearBuilt: null,
    floors: null,
    developer: null,
    developerInfo: null,
    metro: null,
    parking: null,
    website: null,
    description: null,
    rentalInfo: null,
    highlights: [],
    status: 'built',
    ...patch,
  } as BusinessCenter;
}

function snapshot(patch: Partial<MarketSnapshot> & { sliceKey: string; deal: 'rent' | 'sale'; median: number }): MarketSnapshot {
  return {
    id: Math.random(),
    period: '2026-09-01',
    segment: GUIDE_SEGMENT,
    sliceType: 'class',
    currency: 'USD',
    unit: 'usd_per_sqm',
    n: 100,
    p25: null,
    p75: null,
    ...patch,
  } as MarketSnapshot;
}

describe('classProfiles', () => {
  const centers = [
    center({ slug: 'a1', businessClass: 'A', totalArea: 30000, yearBuilt: 2020, floors: 20 }),
    center({ slug: 'a2', businessClass: 'A', totalArea: 10000, yearBuilt: 2022, floors: 10 }),
    center({ slug: 'b1', businessClass: 'B', totalArea: 5000, yearBuilt: 2010, floors: 5 }),
  ];
  const snapshots = [
    snapshot({ sliceKey: 'A', deal: 'rent', median: 16, n: 114 }),
    snapshot({ sliceKey: 'A', deal: 'sale', median: 2265, n: 18 }),
  ];

  it('считает медианы только по своему классу', () => {
    const profiles = classProfiles(centers, snapshots);
    const a = profiles.find((p) => p.cls === 'A')!;
    expect(a.count).toBe(2);
    expect(a.medianArea).toBe(20000);
    expect(a.medianYear).toBe(2021);
    expect(a.medianFloors).toBe(15);
  });

  it('класс без зданий в каталоге не попадает в таблицу', () => {
    expect(classProfiles(centers, snapshots).map((p) => p.cls)).toEqual(['A', 'B']);
  });

  it('окупаемость считается только там, где есть обе ставки', () => {
    const profiles = classProfiles(centers, snapshots);
    expect(profiles.find((p) => p.cls === 'A')!.payback).toBeCloseTo(2265 / (16 * 12), 5);
    expect(profiles.find((p) => p.cls === 'B')!.payback).toBeNull();
  });

  it('малая выборка объявлений помечается ненадёжной, но не прячется', () => {
    const few = classProfiles(centers, [snapshot({ sliceKey: 'A', deal: 'rent', median: 16, n: 3 })]);
    expect(few.find((p) => p.cls === 'A')!.rent).toEqual({ median: 16, n: 3, reliable: false });
  });

  it('снимок чужого сегмента или чужой оси не подхватывается', () => {
    const alien = [
      snapshot({ sliceKey: 'A', deal: 'rent', median: 99, segment: 'sklady' }),
      snapshot({ sliceKey: 'A', deal: 'rent', median: 77, sliceType: 'district' }),
    ];
    expect(classProfiles(centers, alien).find((p) => p.cls === 'A')!.rent).toBeNull();
  });
});

describe('classExamples', () => {
  it('стройка не показывается эталоном класса', () => {
    const centers = [
      center({ slug: 'built', businessClass: 'A', totalArea: 5000 }),
      center({ slug: 'wip', businessClass: 'A', totalArea: 90000, status: 'under_construction' }),
    ];
    expect(classExamples(centers, 'A').map((c) => c.slug)).toEqual(['built']);
  });

  it('сортирует по площади, здания без площади — в конце', () => {
    const centers = [
      center({ slug: 'no-area', businessClass: 'B' }),
      center({ slug: 'small', businessClass: 'B', totalArea: 1000 }),
      center({ slug: 'big', businessClass: 'B', totalArea: 9000 }),
    ];
    expect(classExamples(centers, 'B').map((c) => c.slug)).toEqual(['big', 'small', 'no-area']);
  });
});

describe('rentTierSplit', () => {
  const profileWith = (cls: string, median: number) =>
    ({ cls, count: 1, rent: { median, n: 100, reliable: true } }) as never;

  it('на живых цифрах сентября 2026 видит два яруса', () => {
    const split = rentTierSplit([
      profileWith('A', 16),
      profileWith('B+', 15.85),
      profileWith('B', 11.56),
      profileWith('C', 11),
    ])!;
    expect(split.tiers[0].classes).toEqual(['A', 'B+']);
    expect(split.tiers[1].classes).toEqual(['B', 'C']);
    expect(Math.round(split.gapPct)).toBe(37);
    expect(split.innerGapPct).toBeLessThan(10);
  });

  it('на ровном рынке тезис не заявляется', () => {
    expect(
      rentTierSplit([profileWith('A', 16), profileWith('B+', 15), profileWith('B', 14), profileWith('C', 13)]),
    ).toBeNull();
  });

  it('не склеивает в ярус классы, которые расходятся между собой', () => {
    expect(
      rentTierSplit([profileWith('A', 30), profileWith('B+', 20), profileWith('B', 10), profileWith('C', 9)]),
    ).toBeNull();
  });

  it('меньше трёх ставок — не ярусы, а просто две цифры', () => {
    expect(rentTierSplit([profileWith('A', 20), profileWith('C', 10)])).toBeNull();
  });
});

describe('costExample', () => {
  it('берёт класс с самой большой выборкой объявлений и добавляет НДС', () => {
    const example = costExample([
      { cls: 'A', count: 1, rent: { median: 16, n: 114, reliable: true } },
      { cls: 'B', count: 1, rent: { median: 12, n: 219, reliable: true } },
    ] as never)!;
    expect(example.cls).toBe('B');
    expect(example.monthlyNet).toBe(1200);
    expect(example.monthlyWithVat).toBeCloseTo(1440, 5);
    expect(example.moveInHigh).toBeCloseTo(4320, 5);
  });

  it('ненадёжную выборку в пример не берёт', () => {
    expect(costExample([{ cls: 'C', count: 1, rent: { median: 11, n: 4, reliable: false } }] as never)).toBeNull();
  });
});

describe('fmtRate', () => {
  it('не теряет десятую, но и не дорисовывает нулевую', () => {
    expect(fmtRate(16)).toBe('$16');
    expect(fmtRate(15.85)).toBe('$15,9');
    expect(fmtRate(11.56)).toBe('$11,6');
  });
});

describe('fmtPeriod / latestPeriod', () => {
  it('первое число месяца не уезжает в предыдущий месяц', () => {
    expect(fmtPeriod('2026-09-01')).toBe('сентябрь 2026');
    expect(fmtPeriod('2026-01-01')).toBe('январь 2026');
  });

  it('мусор на входе не превращается в дату', () => {
    expect(fmtPeriod('')).toBeNull();
    expect(fmtPeriod(null)).toBeNull();
    expect(fmtPeriod('сентябрь')).toBeNull();
  });

  it('берёт самый свежий период своего сегмента', () => {
    const rows = [
      snapshot({ sliceKey: 'A', deal: 'rent', median: 16, period: '2026-08-01' }),
      snapshot({ sliceKey: 'A', deal: 'rent', median: 16, period: '2026-09-01' }),
      snapshot({ sliceKey: 'A', deal: 'rent', median: 16, period: '2027-01-01', segment: 'sklady' }),
    ];
    expect(latestPeriod(rows)).toBe('2026-09-01');
  });
});
