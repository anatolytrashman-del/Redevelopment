import { describe, expect, it } from 'vitest';
import { brandSuggestions, buildTcFilterEntry, buildTcFilterIndex, isOpenAt, matchesTcFeatures, tcFormatChips, type TcFilterSource } from './tradeCenterCatalogFeatures';

const base: TcFilterSource = { funKinds: [], foodZones: 0, foodcourtPlaces: 0, anchorCategories: [], parking: null, hours: [], brands: [] };

describe('buildTcFilterEntry', () => {
  it('собирает признаки «что внутри»', () => {
    const e = buildTcFilterEntry({ ...base, funKinds: ['cinema', 'sport'], foodcourtPlaces: 3, anchorCategories: ['гипермаркет'] });
    expect([...e.features].sort()).toEqual(['cinema', 'fitness', 'foodcourt', 'grocery']);
  });

  it('парковка: «открытая» не крытая, «бесплатного периода нет» не бесплатная', () => {
    const paid = buildTcFilterEntry({ ...base, parking: { summary: 'Наземная открытая парковка', items: [{ label: 'Ночной тариф', value: '1,5 руб., бесплатного периода нет' }] } });
    expect(paid.features.has('park-covered')).toBe(false);
    expect(paid.features.has('park-free')).toBe(false);
    const free = buildTcFilterEntry({ ...base, parking: { summary: 'Подземный паркинг', items: [{ label: 'Первые 3 часа', value: 'бесплатно' }, { label: 'Электрозарядки', value: 'есть' }] } });
    expect([...free.features].sort()).toEqual(['ev', 'park-covered', 'park-free']);
  });

  it('«после 22:00» по главной зоне режима, закрытие после полуночи тоже считается', () => {
    const late = buildTcFilterEntry({ ...base, hours: [{ zone: 'Торговая галерея', value: 'ежедневно 10:00–01:00' }, { zone: 'Гипермаркет', value: 'круглосуточно' }] });
    expect(late.features.has('late')).toBe(true);
    const early = buildTcFilterEntry({ ...base, hours: [{ zone: 'Торговая галерея', value: 'ежедневно 10:00–21:00' }, { zone: 'Гипермаркет', value: 'круглосуточно' }] });
    expect(early.features.has('late')).toBe(false);
  });
});

describe('matchesTcFeatures', () => {
  const entry = buildTcFilterEntry({ ...base, funKinds: ['cinema'], hours: [{ zone: 'ТЦ', value: 'ежедневно 10:00–22:00' }], brands: ['Zara', '«Мила»'] });
  it('все признаки должны совпасть', () => {
    expect(matchesTcFeatures(entry, ['cinema'], '', 600)).toBe(true);
    expect(matchesTcFeatures(entry, ['cinema', 'kids'], '', 600)).toBe(false);
  });
  it('«открыто сейчас» по времени Минска', () => {
    expect(matchesTcFeatures(entry, ['open-now'], '', 12 * 60)).toBe(true);
    expect(matchesTcFeatures(entry, ['open-now'], '', 23 * 60)).toBe(false);
    expect(isOpenAt({ openMin: 600, closeMin: 60 }, 30)).toBe(true);
  });
  it('магазин ищется без учёта регистра и кавычек; нет данных — не подходит', () => {
    expect(matchesTcFeatures(entry, [], 'мила', 600)).toBe(true);
    expect(matchesTcFeatures(entry, [], 'ZARA', 600)).toBe(true);
    expect(matchesTcFeatures(entry, [], 'Gloria Jeans', 600)).toBe(false);
    expect(matchesTcFeatures(undefined, ['cinema'], '', 600)).toBe(false);
    expect(matchesTcFeatures(undefined, [], '', 600)).toBe(true);
  });
});

describe('brandSuggestions', () => {
  it('точное совпадение первым, названия как у источника', () => {
    const idx = buildTcFilterIndex({
      a: { ...base, brands: ['Zarina', 'Zara'] },
      b: { ...base, brands: ['Zarina'] },
    });
    expect(brandSuggestions(idx, 'zara')).toEqual(['Zara']);
    expect(brandSuggestions(idx, 'za')).toEqual(['Zara', 'Zarina']);
    expect(brandSuggestions(idx, 'z')).toEqual([]);
  });
});

describe('tcFormatChips', () => {
  it('обычные форматы — одним чипом, стройка с авто — вместе', () => {
    expect(tcFormatChips(['ТРЦ', 'районный ТЦ', 'автоцентр', 'новый формат'])).toEqual([
      { label: 'торговый центр', values: ['ТРЦ', 'районный ТЦ', 'новый формат'] },
      { label: 'стройка и авто', values: ['строительный центр', 'автоцентр'] },
    ]);
  });
});
