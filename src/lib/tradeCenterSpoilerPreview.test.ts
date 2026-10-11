import { describe, expect, it } from 'vitest';
import awardsData from './__fixtures__/tc-awards.json';
import themes from './__fixtures__/tradeCenterFactsReviews/galleria-reviews.json';
import facts from './__fixtures__/tradeCenterFactsReviews/galleria-facts.json';
import { normalizeRetailInfo } from './tradeCenterRetail';
import {
  awardsRankingPreview,
  developerPreview,
  developerPreviewMeta,
  factCardsPreview,
  leasingPreview,
  leasingPreviewMeta,
  mediaMentionsPreview,
  numbersPreview,
  reviewThemesPreview,
  techParamsPreview,
  timelinePreview,
} from './tradeCenterSpoilerPreview';

const zamok = normalizeRetailInfo(awardsData.zamok)!;
const galleria = normalizeRetailInfo(awardsData['galleria-minsk'])!;

describe('превью спойлеров ТЦ', () => {
  it('собирает рейтинг и топ-темы отзывов, не дублируя только счётчик', () => {
    expect(reviewThemesPreview(themes, { source: 'Яндекс.Карты', value: '4,6', totalCount: 600, corpusCount: 1 }))
      .toBe('4,6 ★ · хвалят: удобное расположение · жалуются: очереди в туалеты');
    expect(reviewThemesPreview(themes)).toContain('хвалят:');
    expect(reviewThemesPreview(themes)).toContain('жалуются:');
    expect(reviewThemesPreview({ ...themes, praise: [], complaints: [] })).toMatch(/600\sотзывов/);
  });

  it('для наград Замка показывает место №1 и премию', () => {
    const preview = awardsRankingPreview(zamok.ranking, zamok.awards);
    expect(preview).toMatch(/^№1/);
    expect(preview).toMatch(/Битва торговых центров|Onliner/i);
    expect(awardsRankingPreview([], [])).toBe('Места в рейтингах и отраслевые премии');
    expect(awardsRankingPreview(galleria.ranking, [])).toMatch(/№/);
  });

  it('для СМИ перечисляет издания, а не «N материалов»', () => {
    expect(mediaMentionsPreview([
      { url: 'https://a.by/1', title: 'A', date: null, outlet: 'Onliner' },
      { url: 'https://b.by/1', title: 'B', date: null, outlet: 'CityDog' },
      { url: 'https://a.by/2', title: 'C', date: null, outlet: 'Onliner' },
      { url: 'https://c.by/1', title: 'D', date: null, outlet: 'Tut.by' },
      { url: 'https://d.by/1', title: 'E', date: null, outlet: 'Realt' },
      { url: 'https://e.by/1', title: 'F', date: null, outlet: 'БелТА' },
    ])).toBe('Onliner · CityDog · Tut.by · Realt · ещё 1');
    expect(mediaMentionsPreview([
      { url: 'https://a.by/1', title: 'Большой репортаж про фасад', date: null, outlet: 'Onliner' },
      { url: 'https://a.by/2', title: 'Второй материал', date: null, outlet: 'Onliner' },
      { url: 'https://a.by/3', title: 'Третий', date: null, outlet: 'Onliner' },
    ])).toBe('Onliner: Большой репортаж про фасад · Второй материал · ещё 1');
    expect(mediaMentionsPreview([{ url: 'https://x.by', title: '', date: null, outlet: '' }]))
      .toBe('1 материал');
  });

  it('для фактов добавляет второй заголовок, если оба короткие', () => {
    expect(factCardsPreview([{ headline: 'Короткий факт' }, { headline: 'Второй факт' }]))
      .toBe('Короткий факт · Второй факт');
    expect(factCardsPreview(facts).length).toBeGreaterThan(10);
    expect(factCardsPreview([])).toContain('шапке');
  });

  it('для параметров склеивает парковку, площадь и этажи', () => {
    expect(techParamsPreview({
      parkingShort: 'более 2000 мест',
      rows: [
        { label: 'Общая площадь', value: '75 700 м²' },
        { label: 'Количество этажей', value: '4' },
        { label: 'Год ввода', value: '2014' },
      ],
    })).toBe('Парковка · более 2000 мест · 75 700 м² · 4 эт.');
    expect(techParamsPreview({ totalArea: 12000, yearBuilt: 2010 })).toMatch(/12\s000 м² · 2010/);
    expect(techParamsPreview({})).toContain('Площадь');
  });

  it('для застройщика добавляет масштаб/портфель к имени', () => {
    const info = {
      description: null,
      website: null,
      logoUrl: null,
      phone: null,
      address: null,
      hours: null,
      email: null,
      profile: {
        name: '«Табак-инвест» (сеть «Корона»)',
        founded: '1997',
        hq: 'Минск',
        business: 'Розничная сеть и девелопмент торговой недвижимости.',
        scale: [{ label: 'магазинов', value: '50+', date: null, source: null, sourceUrl: null }],
      },
      companies: [],
      portfolio: Array.from({ length: 12 }, (_, i) => ({
        name: `Объект ${i}`,
        kind: 'ТЦ',
        city: 'Минск',
        year: '2010',
        area: null,
        note: null,
        owner: null,
        source: null,
        sourceUrl: null,
      })),
      facts: [],
    };
    expect(developerPreview(info, info.profile.name)).toBe(
      '«Табак-инвест» (сеть «Корона») · Розничная сеть и девелопмент торговой недвижимости · 50+ магазинов',
    );
    expect(developerPreviewMeta(info)).toBe('12 объектов');
  });

  it('для аренды показывает площади и форматы', () => {
    const rent = {
      deal: 'rent' as const,
      lots: [],
      count: 4,
      priceType: 'торговое',
      priceLots: [],
      median: 30,
      minPrice: 20,
      maxPrice: 40,
      sizeMin: 45,
      sizeMax: 320,
      totalMin: 1000,
      totalMax: 9000,
      propertyTypes: [],
      sizeDiscount: null,
    };
    expect(leasingPreview({
      leasing: { text: '', points: ['островные места от 4 м²', 'корнеры на 1 этаже'], contacts: 'тел', source: null, sourceUrl: null },
      sale: null,
      rent,
      listed: [],
      name: 'ТРЦ «Замок»',
    })).toMatch(/Аренда · 45–320 м² · 4 лота/);
    expect(leasingPreviewMeta({ sale: null, rent, listed: [], leasing: null })).toBe('4 лота');
    expect(leasingPreview({
      leasing: { text: '', points: [], contacts: '+375', source: null, sourceUrl: null },
      sale: null,
      rent: null,
      listed: [],
      name: 'ТРЦ «Замок»',
    })).toContain('Отдел аренды');
  });

  it('для цифр и ленты берёт первые опорные значения', () => {
    expect(numbersPreview([
      { label: 'Общая площадь', value: '75 700 м²', text: null, note: null, date: null, source: null, sourceUrl: null },
      { label: 'Посетителей в день', value: '30 тыс.', text: null, note: null, date: null, source: null, sourceUrl: null },
    ])).toBe('75 700 м² — общая площадь · 30 тыс. — посетителей в день');
    expect(timelinePreview([
      { year: 2011, text: 'Открытие первой очереди' },
      { year: 2014, text: 'Расширение фудкорта' },
    ])).toBe('2011 — открытие первой очереди · 2014 — расширение фудкорта');
  });
});
