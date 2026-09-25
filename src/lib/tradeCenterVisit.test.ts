import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeRetailInfo, retailSectionIds, hoursFaqAnswer, parkingFaqAnswer, transportFaqAnswer } from './tradeCenterRetail';
import { eventDateForVisit, eventsForVisit, hasGettingHereInfo, hasOffersEventsInfo, isHiddenVisitService, loyaltyForVisit, metroStations, parkingForVisit, routeNumbers, shortVisitText, transportForVisit } from './tradeCenterVisit';

// Снимок строк Galleria сохраняем вместе с тестом (владелец, 2026-09-25).
const raw = JSON.parse(readFileSync(new URL('./__fixtures__/tc-visit-galleria.json', import.meta.url), 'utf8'));
const info = normalizeRetailInfo(raw)!;
const noSrc = { source: null, sourceUrl: null };

describe('проезд Galleria', () => {
  it('извлекает номера, объединяет записи и исключает остановки и аэропорт', () => {
    expect(routeNumbers(info.transport[1].text)).toEqual(['1', '24', '38', '57', '69', '73', '91', '119с', '163']);
    expect(routeNumbers('Автобусы 119с, 40а, 300Э, 119с — остановка «Школа 42»')).toEqual(['119с', '40а', '300Э']);
    const result = transportForVisit([...info.transport, { mode: 'bus', text: 'Автобус 1, 42', ...noSrc }]);
    expect(result.routes[0].numbers).toEqual(['1', '24', '38', '57', '69', '73', '91', '119с', '163', '42']);
    expect(result.routes.map((r) => r.label)).toEqual(['Автобус', 'Троллейбус', 'Маршрутка']);
    expect(result.transfers).toEqual([
      { label: 'С вокзала', text: 'удобнее всего на метро до «Немиги».' },
      { label: 'Из аэропорта', text: 'автобус 300Э или маршрутка 1400-ТК до автовокзала «Центральный», дальше метро до «Немиги»' },
    ]);
  });
  it('разбирает пары станция–расстояние и цвет линии', () => {
    expect(metroStations(info.transport[0].text)).toEqual([
      { name: 'Немига', distance: '450 м', line: 'red' },
      { name: 'Фрунзенская', distance: '600 м', line: 'red' },
    ]);
    expect(metroStations('Немига — 450 м; «Восток» 1,2 км')).toEqual([
      { name: 'Восток', distance: '1,2 км', line: 'blue' }, { name: 'Немига', distance: '450 м', line: 'red' },
    ]);
  });
});

describe('парковка Galleria', () => {
  it('оставляет тарифы, въезд, бесплатные условия и краткую зарядку', () => {
    const result = parkingForVisit(info.parking, info.hours)!;
    expect(result.entrance).toBe('с ул. Димитрова');
    expect(result.tiles).toEqual([
      { value: '685', label: 'мест, круглосуточно' },
      { value: '5 руб.', label: 'первые 3 часа' },
      { value: '1 руб.', label: 'каждый следующий час' },
    ]);
    expect(result.free).toHaveLength(3);
    expect(result.free[0]).toContain('3 часа по купону за покупку в ГИППО от 20 руб.');
    expect(result.free.join(' ')).not.toMatch(/[()]/);
    expect(result.charging).toBe('16 станций на 3-м уровне');
    expect(JSON.stringify(result)).not.toMatch(/250|555-00|Уровней/);
  });
  it('не добавляет отсутствующие тарифы и сохраняет ноль', () => {
    expect(parkingForVisit(null)).toBeNull();
    expect(parkingForVisit({ ...info.parking!, items: [], summary: 'Длинное описание' })).toBeNull();
    expect(parkingForVisit({ ...info.parking!, items: [{ label: 'Первые 2 часа', value: '0 руб.' }] })?.tiles).toEqual([{ value: '0 руб.', label: 'первые 2 часа' }]);
    expect(parkingForVisit({ ...info.parking!, summary: '' }, info.hours)?.tiles[0].label).toBe('мест, круглосуточно');
  });
});

describe('лояльность и события', () => {
  it('извлекает три факта из реального текста Galleria', () => {
    expect(loyaltyForVisit(info.loyalty[0])).toMatchObject({
      subtitle: 'Можно без белорусского номера', fallback: '', facts: [
        { value: '1 балл', label: 'за каждый рубль в чеке' },
        { value: '72 часа', label: 'чтобы отсканировать чек' },
        { value: 'Мерч, билеты', label: 'за баллы' },
      ],
    });
  });
  it('сохраняет текст незнакомой программы с обрезкой по предложению', () => {
    const text = `Скидка по карте. ${'Очень длинное описание '.repeat(12)}`;
    expect(loyaltyForVisit({ name: 'Карта', text, ...noSrc }).fallback).toBe('Скидка по карте.');
    expect(shortVisitText('Слово '.repeat(100)).length).toBeLessThanOrEqual(161);
  });
  it('оставляет регулярные, скрывает прошлые разовые, сортирует стабильно без изменения исходника', () => {
    const future = { name: 'Будущее', date: '2027', text: '', ...noSrc };
    const old = { ...future, name: 'Прошлое', date: '2025' };
    const entries = [future, old, ...info.events];
    const result = eventsForVisit(entries, 2026);
    // «второй сезон» забега 2025 года — разовое прошедшее событие, не регулярное.
    expect(result.map((e) => e.name)).toEqual([...info.events.map((e) => e.name).filter((name) => name !== 'QUATRIUM Challenge'), 'Будущее']);
    expect(entries[0]).toBe(future);
    expect(eventsForVisit([{ ...future, date: '2024–2027' }], 2026)).toHaveLength(1);
    expect(eventDateForVisit(info.events[0])).toBe('Летом по субботам в 11:00');
    expect(eventDateForVisit(info.events.at(-1)!)).toBe('Каждый сезон');
  });
});

describe('условия видимости и FAQ', () => {
  it('не создаёт блоки из скрытых данных или прошлых разовых событий', () => {
    const hidden = normalizeRetailInfo({ hours: raw.hours, hoursNote: 'Праздничный график', rules: [{ text: 'Не курить' }], transport: [{ mode: 'car', text: 'Въезд' }], events: [{ date: '2000', name: 'Открытие' }] })!;
    expect(hasGettingHereInfo(hidden)).toBe(false);
    expect(hasOffersEventsInfo(hidden)).toBe(false);
    expect(retailSectionIds(hidden)).toEqual([]);
    expect(retailSectionIds(info)).toEqual(['getting-here', 'offers-events']);
    expect(isHiddenVisitService('Гардероб')).toBe(true);
    expect(isHiddenVisitService('Информационный центр')).toBe(true);
    expect(isHiddenVisitService('Банкомат')).toBe(false);
  });
  it('оставляет исходные часы, парковку и транспорт для FAQ', () => {
    expect(hoursFaqAnswer(info.hours, info.hoursNote)).toContain('10:00–22:00');
    expect(parkingFaqAnswer(info.parking)).toContain('685');
    expect(transportFaqAnswer(info.transport)).toContain('На машине');
  });
});
