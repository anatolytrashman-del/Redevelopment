import { describe, expect, it } from 'vitest';
import type { RetailServiceEntry, RetailServiceGroup } from '../data/businessCenters';
import {
  buildTradeCenterInfrastructure,
  infrastructureFaqAnswer,
  infrastructureSectionSize,
  serviceAmenityLabel,
} from './tradeCenterInfrastructure';

const svc = (
  name: string,
  group: RetailServiceGroup,
  over: Partial<RetailServiceEntry> = {},
): RetailServiceEntry => ({ name, group, text: null, floor: null, source: null, sourceUrl: null, ...over });

describe('serviceAmenityLabel', () => {
  it('узнаёт в удобстве с сайта ТЦ то же оборудование, что у Яндекса', () => {
    expect(serviceAmenityLabel('Инфоцентры')).toBe('Инфоцентр');
    expect(serviceAmenityLabel('Информационный центр')).toBe('Инфоцентр');
    expect(serviceAmenityLabel('Инфоцентр')).toBe('Инфоцентр');
    expect(serviceAmenityLabel('Велопарковка')).toBe('Велопарковка');
    expect(serviceAmenityLabel('Гардероб')).toBe('Гардероб');
    expect(serviceAmenityLabel('Комната матери и ребёнка')).toBe('Комната матери и ребёнка');
    expect(serviceAmenityLabel('Туалеты')).toBe('Туалет');
    expect(serviceAmenityLabel('Зарядка гаджетов')).toBe('Зарядная станция');
  });

  it('туалеты для маломобильных — не те же туалеты', () => {
    expect(serviceAmenityLabel('Туалеты для маломобильных')).toBeNull();
    expect(serviceAmenityLabel('Обмен валют')).toBeNull();
  });
});

describe('buildTradeCenterInfrastructure', () => {
  const groups = buildTradeCenterInfrastructure(
    [
      svc('Обмен валют', 'money', { floor: '2', text: 'Обменный пункт Технобанка.' }),
      svc('Информационный центр', 'info', { text: 'Справочная ТЦ.' }),
      svc('Велопарковка', 'car', { text: 'У входа.' }),
      svc('Туалеты для маломобильных', 'access', { floor: '1' }),
    ],
    [
      { category: 'Банкомат', count: 19 },
      { category: 'Велопарковка', count: 8 },
      { category: 'Туалет', count: 8 },
      { category: 'Платёжный терминал', count: 7 },
      { category: 'Парковка', count: 2 },
      { category: 'Зарядка электромобилей', count: 2 },
      { category: 'Инфоцентр', count: 1 },
    ],
  );

  it('группы — в порядке показа, пустых нет', () => {
    expect(groups.map((g) => g.id)).toEqual(['info', 'comfort', 'access', 'money', 'car']);
    expect(groups[0].label).toBe('Информация и связь');
  });

  it('склеивает сервис и оборудование об одном и том же', () => {
    const info = groups[0].items;
    expect(info).toHaveLength(1);
    expect(info[0]).toMatchObject({ title: 'Информационный центр', count: 1, text: 'Справочная ТЦ.', amenity: 'Инфоцентр' });
    const car = groups.find((g) => g.id === 'car')!.items;
    expect(car.map((i) => [i.title, i.count])).toEqual([
      ['Велопарковка', 8],
      ['Зарядка электромобилей', 2],
    ]);
    expect(car[0].text).toBe('У входа.');
  });

  it('парковку у ТЦ не показывает', () => {
    const titles = groups.flatMap((g) => g.items.map((i) => i.title));
    expect(titles).not.toContain('Парковка');
  });

  it('сначала сервисы, за ними оборудование без пары', () => {
    const money = groups.find((g) => g.id === 'money')!.items;
    expect(money.map((i) => i.title)).toEqual(['Обмен валют', 'Банкоматы', 'Терминалы']);
  });

  it('FAQ — строка на группу, с этажом и числом', () => {
    const answer = infrastructureFaqAnswer(groups)!;
    expect(answer.split('\n')).toHaveLength(5);
    expect(answer).toContain(
      'Деньги: обмен валют (2 этаж) — Обменный пункт Технобанка; банкоматы (19 шт.); терминалы (7 шт.).',
    );
    expect(answer).toContain('Доступная среда: туалеты для маломобильных (1 этаж).');
    expect(infrastructureFaqAnswer([])).toBeNull();
  });

  it('модель высоты считает строки пояснений, а не только плитки', () => {
    const short = buildTradeCenterInfrastructure([svc('Wi-Fi', 'info')], []);
    const text = 'Бесплатная сеть во всех общих зонах, вход по SMS-коду; иностранцам помогают на инфоцентре.';
    const long = buildTradeCenterInfrastructure([svc('Wi-Fi', 'info', { text })], []);
    // Подзаголовок (2) + отступ ряда (1) + плитка: минимум две строки.
    expect(infrastructureSectionSize(short)).toBe(5);
    expect(infrastructureSectionSize(long)).toBe(7);
    // Пять групп, в каждой один ряд из коротких плиток.
    expect(infrastructureSectionSize(groups)).toBe(25);
  });

  it('ни сервисов, ни оборудования — ничего', () => {
    expect(buildTradeCenterInfrastructure([], [])).toEqual([]);
    expect(buildTradeCenterInfrastructure([], [{ category: 'Парковка', count: 3 }])).toEqual([]);
  });
});
