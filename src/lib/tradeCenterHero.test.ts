import { describe, expect, it } from 'vitest';
import type { RetailFigureEntry, RetailFoodInfo, RetailFunEntry, RetailHoursEntry, RetailInfo, RetailParking } from '../data/businessCenters';
import {
  hoursLiveStatus,
  laterClosingZones,
  parseDailyHours,
  pickMainHoursZone,
  selectTcFactTiles,
  tcAudienceVisitorsPerDay,
  tcFirstFunName,
  tcFoodPointsCount,
  tcHeroInsideLines,
  tcFitPoints,
  tcHeroPhotoLead,
  tcHeroSubtitle,
  tcMeaningfulAltNames,
  tcMustHaveItems,
  tcParkingShort,
  tcParkingSpaces,
  tcQuickJumpChips,
} from './tradeCenterHero';

const hours = (zone: string, value: string, note: string | null = null): RetailHoursEntry => ({
  zone,
  value,
  note,
  source: null,
  sourceUrl: null,
});

describe('tcHeroSubtitle', () => {
  it('собирает формат, этажи и год', () => {
    expect(tcHeroSubtitle({ retailFormat: 'ТРЦ', floors: 4, yearBuilt: 2016, status: null })).toBe(
      'ТРЦ · 4 этажа · с 2016 года',
    );
  });
  it('без формата подставляет «ТЦ», строящееся здание — «открытие в …»', () => {
    expect(tcHeroSubtitle({ retailFormat: null, floors: null, yearBuilt: 2027, status: 'under_construction' })).toBe(
      'ТЦ · открытие в 2027',
    );
  });
  it('без floors/yearBuilt — только формат', () => {
    expect(tcHeroSubtitle({ retailFormat: 'аутлет', floors: null, yearBuilt: null, status: null })).toBe('аутлет');
  });
});

describe('parseDailyHours', () => {
  it('разбирает «ежедневно 10:00–22:00»', () => {
    expect(parseDailyHours('ежедневно 10:00–22:00')).toEqual({ openMin: 600, closeMin: 1320 });
  });
  it('дефис вместо тире тоже разбирается', () => {
    expect(parseDailyHours('10:00-22:00')).toEqual({ openMin: 600, closeMin: 1320 });
  });
  it('«круглосуточно» — особое значение', () => {
    expect(parseDailyHours('круглосуточно')).toBe('always');
  });
  it('закрытие после полуночи — просто минуты, без переноса даты', () => {
    expect(parseDailyHours('ежедневно 10:00–02:00')).toEqual({ openMin: 600, closeMin: 120 });
  });
  it('несколько диапазонов — неоднозначно, null', () => {
    expect(parseDailyHours('Пн-Чт 10:00-22:00, Пт-Вс 10:00-23:00')).toBeNull();
  });
  it('день недели без «ежедневно» — неоднозначно, null', () => {
    expect(parseDailyHours('будни 09:00-21:00')).toBeNull();
  });
  it('пустая строка — null', () => {
    expect(parseDailyHours('')).toBeNull();
  });
});

describe('hoursLiveStatus', () => {
  it('сейчас в пределах диапазона — открыто', () => {
    const parsed = parseDailyHours('ежедневно 10:00–22:00');
    expect(hoursLiveStatus(parsed, 12 * 60)).toEqual({ open: true, label: 'Открыто до 22:00' });
  });
  it('сейчас до открытия — закрыто', () => {
    const parsed = parseDailyHours('ежедневно 10:00–22:00');
    expect(hoursLiveStatus(parsed, 8 * 60)).toEqual({ open: false, label: 'Закрыто · откроется в 10:00' });
  });
  it('диапазон через полночь — открыто и до, и после полуночи', () => {
    const parsed = parseDailyHours('ежедневно 10:00–02:00');
    expect(hoursLiveStatus(parsed, 60)?.open).toBe(true); // 01:00
    expect(hoursLiveStatus(parsed, 23 * 60)?.open).toBe(true); // 23:00
    expect(hoursLiveStatus(parsed, 5 * 60)?.open).toBe(false); // 05:00
  });
  it('круглосуточно — всегда открыто', () => {
    expect(hoursLiveStatus('always', 3 * 60)).toEqual({ open: true, label: 'Открыто круглосуточно' });
  });
  it('null — статуса нет', () => {
    expect(hoursLiveStatus(null, 12 * 60)).toBeNull();
  });
});

describe('pickMainHoursZone', () => {
  it('выбирает торговую галерею, даже если она не первая', () => {
    const list = [hours('Гипермаркет ГИППО', 'ежедневно 08:00–23:00'), hours('Торговая галерея', 'ежедневно 10:00–22:00')];
    expect(pickMainHoursZone(list)?.zone).toBe('Торговая галерея');
  });
  it('без явной галереи — первая запись', () => {
    const list = [hours('Паркинг', 'круглосуточно'), hours('Гипермаркет ГИППО', 'ежедневно 08:00–23:00')];
    expect(pickMainHoursZone(list)?.zone).toBe('Паркинг');
  });
  it('пустой список — null', () => {
    expect(pickMainHoursZone([])).toBeNull();
  });
});

describe('laterClosingZones', () => {
  it('находит зоны, закрывающиеся позже главной, отсортированные по времени', () => {
    const main = hours('Торговая галерея', 'ежедневно 10:00–22:00');
    const list = [
      main,
      hours('Гиппо', 'ежедневно 08:00–02:00'),
      hours('Рестораны', 'ежедневно 10:00–23:00'),
      hours('Аптека', 'ежедневно 09:00–21:00'),
    ];
    expect(laterClosingZones(list, main)).toEqual([
      { zone: 'Гиппо', label: 'Гиппо до 02:00' },
      { zone: 'Рестораны', label: 'Рестораны до 23:00' },
    ]);
  });
  it('главная зона круглосуточно — сравнивать не с чем', () => {
    const main = hours('Паркинг', 'круглосуточно');
    expect(laterClosingZones([main, hours('Галерея', 'ежедневно 10:00–22:00')], main)).toEqual([]);
  });
  it('нет главной зоны — пусто', () => {
    expect(laterClosingZones([], null)).toEqual([]);
  });
});

const parking = (over: Partial<RetailParking> = {}): RetailParking => ({
  summary: '',
  items: [],
  date: null,
  source: null,
  sourceUrl: null,
  ...over,
});

describe('tcParkingShort / tcParkingSpaces', () => {
  it('null-парковка — null', () => {
    expect(tcParkingShort(null)).toBeNull();
    expect(tcParkingSpaces(null)).toBeNull();
  });
  it('места + summary, обрезано до maxLength', () => {
    const p = parking({ items: [{ label: 'Мест', value: '685' }], summary: 'въезд с ул. Димитрова, есть подземный паркинг' });
    const short = tcParkingShort(p);
    expect(short).not.toBeNull();
    expect(short!.length).toBeLessThanOrEqual(60);
    expect(short).toContain('685 мест');
    expect(tcParkingSpaces(p)).toBe('685');
  });
  it('нет мест и summary — берёт первый item', () => {
    const p = parking({ items: [{ label: 'Первый час', value: 'бесплатно' }] });
    expect(tcParkingShort(p)).toBe('Первый час: бесплатно');
  });
  it('совсем пусто — null', () => {
    expect(tcParkingShort(parking())).toBeNull();
  });
  it('оговорки источника не тащит и не режет многоточием', () => {
    const p = parking({ items: [{ label: 'Мест', value: 'около 750 (600 у здания + 150 вокруг) — по данным 2017 года' }], summary: 'Большая бесплатная парковка у входа, рядом ещё две городские стоянки на 300 машин' });
    expect(tcParkingShort(p)).toBe('около 750 мест');
    expect(tcParkingSpaces(p)).toBe('около 750');
    expect(tcParkingSpaces(parking({ items: [{ label: 'Мест', value: '300–500 на 3–4 уровнях (разные страницы)' }] }))).toBe('300–500 на 3–4 уровнях');
    expect(tcParkingShort(parking({ summary: 'Своего паркинга у галереи нет: рядом наземные парковки во дворах и у соседнего бизнес-центра' }))).toBeNull();
  });
});

describe('selectTcFactTiles', () => {
  it('берёт до трёх основных плиток по приоритету', () => {
    const tiles = selectTcFactTiles({
      tenantCount: 120,
      totalArea: 68000,
      audienceValue: '30 тыс.+',
      parkingSpaces: '685',
      mapRatingLabel: '4.6',
    });
    expect(tiles.map((t) => t.kind)).toEqual(['tenants', 'area', 'audience']);
  });
  it('добирает запасными, когда основных меньше трёх', () => {
    const tiles = selectTcFactTiles({
      tenantCount: 0,
      totalArea: 5000,
      audienceValue: null,
      parkingSpaces: '200',
      mapRatingLabel: '4.2',
    });
    expect(tiles.map((t) => t.kind)).toEqual(['area', 'parking', 'rating']);
    expect(tiles.find((t) => t.kind === 'parking')).toEqual({ kind: 'parking', value: '200', label: 'Мест на парковке' });
  });
  it('совсем без данных — пустой список', () => {
    expect(
      selectTcFactTiles({ tenantCount: 0, totalArea: null, audienceValue: null, parkingSpaces: null, mapRatingLabel: null }),
    ).toEqual([]);
  });
});

const figure = (label: string, value: string): RetailFigureEntry => ({
  label,
  value,
  date: null,
  note: null,
  text: null,
  source: null,
  sourceUrl: null,
});

describe('tcAudienceVisitorsPerDay', () => {
  it('находит цифру посетителей в день', () => {
    expect(tcAudienceVisitorsPerDay([figure('Посетителей в день', '30 тыс.+'), figure('Средний чек', '25 руб.')])).toBe(
      '30 тыс.+',
    );
  });
  it('без подходящей записи — null', () => {
    expect(tcAudienceVisitorsPerDay([figure('Средний чек', '25 руб.')])).toBeNull();
  });
});

const food = (places: RetailFoodInfo['places']): RetailFoodInfo => ({ summary: null, zones: [], places });
const fun = (name: string): RetailFunEntry => ({
  name,
  kind: 'cinema',
  floor: null,
  area: null,
  capacity: null,
  formats: [],
  hours: null,
  since: null,
  text: null,
  yandexUrl: null,
  source: null,
  sourceUrl: null,
});

describe('tcFoodPointsCount / tcFirstFunName', () => {
  it('считает заведения', () => {
    expect(tcFoodPointsCount(food([{ name: 'A', type: 'cafe', cuisine: null, floor: null, inFoodcourt: null, yandexUrl: null, note: null }]))).toBe(1);
    expect(tcFoodPointsCount(null)).toBe(0);
  });
  it('берёт имя первого развлечения', () => {
    expect(tcFirstFunName([fun('SkyKart')])).toBe('SkyKart');
    expect(tcFirstFunName([])).toBeNull();
  });
});

describe('tcQuickJumpChips', () => {
  it('null info — пусто', () => {
    expect(tcQuickJumpChips(null)).toEqual([]);
  });
});

describe('tcHeroPhotoLead / tcHeroInsideLines / tcMeaningfulAltNames', () => {
  const info = {
    factCards: null,
    reviewThemes: null,
    floorsGuide: [],
    anchors: [
      {
        name: 'Гипермаркет «Корона»',
        category: 'гипермаркет' as const,
        floor: '1',
        area: null,
        since: null,
        text: '',
        yandexUrl: null,
        source: null,
        sourceUrl: null,
      },
    ],
    timeline: [],
    leisure: [],
    food: food([
      { name: 'A', type: 'cafe' as const, cuisine: null, floor: null, inFoodcourt: null, yandexUrl: null, note: null },
      { name: 'B', type: 'cafe' as const, cuisine: null, floor: null, inFoodcourt: null, yandexUrl: null, note: null },
    ]),
    fun: [fun('3D-Кино «В Замке»'), { ...fun('Ледовый каток'), kind: 'ice' as const, name: 'Ледовый каток' }],
    ranking: [],
    awards: [],
    hours: [],
    hoursNote: null,
    parking: null,
    transport: [],
    services: [],
    rules: [],
    loyalty: [],
    events: [],
    audience: [],
    leasing: null,
    advertising: null,
    numbers: [],
    quotes: [],
    vacancies: [],
    tenantsAt: null,
  } as RetailInfo;

  it('lead на фото — короткие ярлыки развлечений', () => {
    expect(tcHeroPhotoLead(info)).toBe('Кино · Каток');
  });

  it('inside — inventory-строки со ссылками', () => {
    expect(tcHeroInsideLines(info).map((line) => line.href)).toEqual(['#anchors', '#fun', '#food']);
    expect(tcHeroInsideLines(info)[2]?.detail).toBe('2\u00a0заведения');
  });

  it('alt-имена без дублей формата', () => {
    expect(tcMeaningfulAltNames('ТРЦ «Замок»', ['ТРЦ «Замок»', 'ТЦ «Замок»', 'Zamok'])).toEqual(['Zamok']);
  });

  it('must-have — парковка/якоря/развлечения без статуса часов', () => {
    const items = tcMustHaveItems(info, { parkingShort: 'более 2000 мест', metroLabel: '«Победителей» · 400\u00a0м' });
    expect(items.map((i) => i.kind)).toEqual(['parking', 'metro', 'anchor', 'fun', 'food']);
    expect(items.some((i) => /открыт|закрыт/i.test(i.value))).toBe(false);
    // Один якорь в фикстуре — имя; при ≥3 будет счёт «N якорей».
    expect(items.find((i) => i.kind === 'anchor')?.value).toContain('Корона');
  });

  it('must-have — при многих якорях короткий счёт, не список имён', () => {
    const many = {
      ...info,
      anchors: Array.from({ length: 6 }, (_, i) => ({
        ...info.anchors[0],
        name: `Якорь ${i + 1}`,
      })),
    };
    const items = tcMustHaveItems(many, { parkingShort: '2000 мест' });
    expect(items.find((i) => i.kind === 'anchor')?.value).toBe('6\u00a0якорей');
  });

  it('fit — выигрывает/проигрывает аналогам только из фактов', () => {
    const points = tcFitPoints(info, {
      parkingSpaces: '2000',
      tenantCount: 477,
      hasMetro: true,
      totalArea: 93000,
    });
    expect(points.some((p) => p.side === 'win' && /кино|каток/i.test(p.text))).toBe(true);
    expect(points.some((p) => p.side === 'win' && /парковк/i.test(p.text))).toBe(true);
    expect(points.some((p) => p.side === 'win' && /аналог|крупн|больше|шире|ряду/i.test(p.text))).toBe(true);
    expect(points.filter((p) => p.side === 'win').length).toBeLessThanOrEqual(3);
    expect(points.filter((p) => p.side === 'lose').length).toBeLessThanOrEqual(3);
  });
});
