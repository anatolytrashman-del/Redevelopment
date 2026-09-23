import { describe, expect, it } from 'vitest';

import { addressKey, dedupeAcrossSources, dropDuplicateAdIds } from './citywideExtraSources.mjs';

// Все адреса ниже — не выдуманные, а снятые с живой выдачи площадок
// 2026-09-20 (по одной строке на формат каждой из четырёх).
describe('ключ адреса', () => {
  it('сводит один дом, записанный четырьмя площадками по-разному', () => {
    const kufar = addressKey('Победителей пр, 108, Минск');
    expect(addressKey('ПОБЕДИТЕЛЕЙ, 108')).toBe(kufar); // Megapolis, верхним регистром и без типа улицы
    expect(addressKey('Минск Победителей пр-т 108')).toBe(kufar); // Realt, город впереди и без запятых
    expect(addressKey('пр-т Победителей, д. 108')).toBe(kufar); // Domovita, тип улицы перед названием
  });

  it('не зависит от порядка слов в названии улицы', () => {
    // Kufar пишет «Веры Хоружей», Megapolis — «ХОРУЖЕЙ ВЕРЫ»: без сортировки
    // слов это два разных ключа и один лот считается дважды.
    expect(addressKey('ХОРУЖЕЙ ВЕРЫ, 25, к.3')).toBe(addressKey('Веры Хоружей ул, 25, Минск'));
  });

  it('работает не только для улиц — прежний ключ проспекты и тракты терял', () => {
    expect(addressKey('Минск Старовиленский тракт 87')).toBe(addressKey('Старовиленский тракт, 87, Минск'));
    expect(addressKey('Минск Веснинка пер. 16')).toBe(addressKey('Веснинка пер, 16, Минск'));
  });

  it('различает литер и номер дома', () => {
    expect(addressKey('Победителей пр, 63В, Минск')).not.toBe(addressKey('Победителей пр, 63, Минск'));
    expect(addressKey('Тимирязева ул, 72, Минск')).not.toBe(addressKey('Тимирязева ул, 7, Минск'));
  });

  it('без номера дома ключа нет — схлопывать по одной улице нельзя', () => {
    expect(addressKey('ул. Тимирязева')).toBeNull();
    expect(addressKey('')).toBeNull();
    expect(addressKey(null)).toBeNull();
  });
});

const offer = (source, over = {}) => ({
  source,
  deal_type: 'rent',
  address: 'Победителей пр, 108, Минск',
  size: 40,
  price_per_sqm: 20,
  floor: 3,
  ...over,
});

describe('схлопывание лота с разных площадок', () => {
  it('схлопывает один лот, вывешенный на двух площадках', () => {
    const { offers, dropped } = dedupeAcrossSources([offer('Kufar'), offer('Realt')]);
    expect(dropped).toBe(1);
    expect(offers).toHaveLength(1);
    expect(offers[0].source).toBe('Kufar'); // выживает первый по порядку — у него полнее поля
  });

  it('два одинаковых объявления ВНУТРИ площадки остаются двумя', () => {
    // Несколько одинаковых кабинетов по одной ставке у одного собственника —
    // обычное дело, схлопывать их значит занижать предложение.
    const { offers, dropped } = dedupeAcrossSources([offer('Kufar'), offer('Kufar')]);
    expect(dropped).toBe(0);
    expect(offers).toHaveLength(2);
  });

  it('пустой этаж у Megapolis не мешает схлопыванию', () => {
    // Главное, ради чего этаж убран из сравнения: в карточке листинга
    // Megapolis этажа нет вовсе, и с этажом в ключе его строки не
    // схлопывались бы с Kufar никогда.
    const { dropped } = dedupeAcrossSources([offer('Kufar', { floor: 3 }), offer('Megapolis', { floor: null })]);
    expect(dropped).toBe(1);
  });

  it('терпит расхождение ставки в пределах 10% — площадки считают её по-разному', () => {
    expect(dedupeAcrossSources([offer('Kufar', { price_per_sqm: 20 }), offer('Realt', { price_per_sqm: 21 })]).dropped).toBe(1);
    expect(dedupeAcrossSources([offer('Kufar', { price_per_sqm: 20 }), offer('Realt', { price_per_sqm: 30 })]).dropped).toBe(0);
  });

  it('разная площадь, сделка или дом — разные лоты', () => {
    expect(dedupeAcrossSources([offer('Kufar'), offer('Realt', { size: 55 })]).dropped).toBe(0);
    expect(dedupeAcrossSources([offer('Kufar'), offer('Realt', { deal_type: 'sale' })]).dropped).toBe(0);
    expect(dedupeAcrossSources([offer('Kufar'), offer('Realt', { address: 'Победителей пр, 63, Минск' })]).dropped).toBe(0);
  });

  it('три площадки на один лот оставляют одну запись', () => {
    const { offers, dropped } = dedupeAcrossSources([offer('Kufar'), offer('Realt'), offer('Megapolis', { floor: null })]);
    expect(dropped).toBe(2);
    expect(offers).toHaveLength(1);
  });

  it('строку без адреса или без цены не теряет', () => {
    const { offers, dropped } = dedupeAcrossSources([
      offer('Domovita', { address: null }),
      offer('Megapolis', { price_per_sqm: null }),
    ]);
    expect(dropped).toBe(0);
    expect(offers).toHaveLength(2);
  });
});

describe('страховка от повторяющегося ad_id', () => {
  it('оставляет одну строку из пары с одинаковым (источник, ad_id)', () => {
    // Роняло всю вставку целиком: id объявления Domovita уникален лишь
    // внутри раздела, и один номер пришёл и из аренды, и из продажи.
    const { offers, collisions } = dropDuplicateAdIds([
      { source: 'Domovita', ad_id: '10409' },
      { source: 'Domovita', ad_id: '10409' },
    ]);
    expect(offers).toHaveLength(1);
    expect(collisions).toEqual(['Domovita|10409']);
  });

  it('одинаковый ad_id у РАЗНЫХ площадок — не коллизия', () => {
    const { offers, collisions } = dropDuplicateAdIds([
      { source: 'Domovita', ad_id: '10409' },
      { source: 'Megapolis', ad_id: '10409' },
    ]);
    expect(offers).toHaveLength(2);
    expect(collisions).toHaveLength(0);
  });
});
