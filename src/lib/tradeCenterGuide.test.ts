import { describe, expect, it } from 'vitest';
import type { TenantOrganizationView } from '../data/businessCenterTenants';
import { buildFloorBoard, exactOrganization, nearbyOrganizations, normalizeBrand, parseFloorGuide, searchOrganizations, shopLabel, uniqueBrandsByCenter } from './tradeCenterGuide';

function org(name: string, floor: string | null = '1', rubric = 'Магазин одежды', reviewCount = 0): TenantOrganizationView {
  return { name, floor, rubric, reviewCount, industry: null, placement: null, coords: null, rating: null, url: null };
}
const entry = (floor: string, text: string) => ({ floor, text, date: null, source: null, sourceUrl: null });

describe('табло этажей', () => {
  it('разбирает строку Galleria и сохраняет кавычки бренда', () => {
    expect(parseFloorGuide('фудкорт и рестораны (около 5000 м²): KFC, Burger King, «Васильки», …')).toEqual({ theme: 'Фудкорт и рестораны', brands: ['KFC', 'Burger King', '«Васильки»'] });
    expect(parseFloorGuide('дети: Familia (одежда), Mothercare | OVS kids; Trend Park и др.')).toEqual({ theme: 'Дети', brands: ['Familia', 'Mothercare | OVS kids', 'Trend Park'] });
  });
  it('без двоеточия берёт короткую тему и запасные бренды', () => {
    expect(parseFloorGuide('одежда и обувь. Второе предложение', ['Mango'])).toEqual({ theme: 'Одежда и обувь', brands: ['Mango'] });
  });
  it('при наличии гида не добавляет гостиницу и офисы', () => {
    expect(buildFloorBoard([entry('-1', 'продукты'), entry('6', 'еда')], [org('Отель', '8'), org('Офис', '21')]).map((row) => row.floor)).toEqual(['6', '-1']);
  });
  it('без гида обрезает башню и сводит категории, сортирует бренды по отзывам', () => {
    const shops = [org('Mango', '2', 'Магазин одежды', 10), org('Zara', '2'), org('Кафе', '2', 'Кафе', 20), org('Обувь', '2', 'Магазин обуви'), org('Бутик', '2'), org('Офис', '21', 'Офис'), org('Маркет', '-1', 'Супермаркет')];
    const board = buildFloorBoard([], shops);
    expect(board.map((row) => row.floor)).toEqual(['2', '-1']);
    expect(board[0].theme).toBe('Одежда и еда');
    expect(board[0].brands.slice(0, 2)).toEqual(['Кафе', 'Mango']);
    expect(buildFloorBoard([], [org('Магазин', null)])).toEqual([]);
    expect(buildFloorBoard([], [org('Магазин', '0')])[0].floor).toBe('0');
  });
});

describe('поиск и соседи', () => {
  it('ищет подстроку, ё=е и без регистра, не больше пяти строк', () => {
    const shops = [org('Ёлки-палки'), ...Array.from({ length: 8 }, (_, i) => org(`Ёлки ${i}`))];
    expect(searchOrganizations(shops, ' ЕЛКИ ')).toHaveLength(5);
    expect(searchOrganizations(shops, 'палки')[0].name).toBe('Ёлки-палки');
    expect(searchOrganizations(shops, ' ')).toEqual([]);
    expect(exactOrganization(shops, 'ёлки')).toBeNull();
    expect(exactOrganization(shops, ' ЕЛКИ-ПАЛКИ ')).toBe(shops[0]);
    expect(exactOrganization([org('Mango'), org('Mango', '2')], 'mango')).toBeNull();
  });
  it('сначала та же исходная рубрика, затем отзывы; мусор и другие этажи исключены', () => {
    const target = org('Mango');
    const shops = [target, org('Zara', '1', 'Магазин одежды', 1), org('Кофе', '1', 'Кафе', 100), org('Обувь', '1', 'Магазин обуви', 50), org('Банк', '1', 'Банк', 1000), org('Другой этаж', '2', 'Магазин одежды', 200)];
    expect(nearbyOrganizations(shops, target).map((item) => item.name)).toEqual(['Zara', 'Кофе', 'Обувь']);
    expect(nearbyOrganizations(shops, org('Без этажа', null))).toEqual([]);
  });
});

describe('уникальные бренды', () => {
  it('нормализует имена, сравнивает только ТЦ, убирает дубли и сортирует по отзывам', () => {
    const result = uniqueBrandsByCenter([
      { slug: 'a', kind: 'tc', organizations: [org('Ёлки-палки'), org('Vans', '1', 'Магазин обуви', 20), org('Vans', '2', 'Магазин обуви', 1), org('Кафе Река', '1', 'Кафе', 50), org('Банк', '1', 'Банк'), org('AB')] },
      { slug: 'b', kind: 'tc', organizations: [org('Елки Палки', '1', 'Неизвестная рубрика')] },
      { slug: 'office', kind: 'bc', organizations: [org('Vans')] },
    ]);
    expect(normalizeBrand(' Ёлки-Палки! ')).toBe('елкипалки');
    expect(result.get('a')).toEqual([{ name: 'Кафе Река', label: 'кафе' }, { name: 'Vans', label: 'обувь' }]);
    expect(result.has('office')).toBe(false);
  });
  it('ограничивает семью брендами', () => {
    expect(uniqueBrandsByCenter([{ slug: 'a', kind: 'tc', organizations: Array.from({ length: 10 }, (_, i) => org(`Бренд ${i}`)) }]).get('a')).toHaveLength(7);
  });
  it.each(['Туалет', 'Банкомат', 'Банк', 'Микрофинансы', 'Криптомат', 'Офис', 'Гостиница', 'Казино', 'Ломбард', 'Организация мероприятий', 'Перевозки', 'этаж 2'])('отсекает %s даже рядом с магазинной рубрикой', (name) => {
    expect(shopLabel(org(name, '1', 'Магазин'))).toBeNull();
  });
});

describe('табло этажей: список в скобках', () => {
  it('берёт тему из позиций и бренды из первых скобок', () => {
    expect(parseFloorGuide('ювелирные салоны и часы (SOKOLOV, Pandora, MIUZ, TOUS), бельё (Calzedonia), косметика')).toEqual({
      theme: 'Ювелирные салоны и часы, бельё',
      brands: ['SOKOLOV', 'Pandora', 'MIUZ'],
    });
  });
});
