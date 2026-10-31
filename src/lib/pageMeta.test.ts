import { describe, it, expect } from 'vitest';
import { businessCenterHubDescription, fallbackBusinessCenterMeta } from './pageMeta';
import { reviewMonthLabel } from './tcReviewTitle';

// Формат сниппета карточки БЦ задал владелец 2026-09-22, увидев страницу в
// выдаче Google: title — «Бизнес-центр <имя> — полный обзор <год>»,
// description — «Актуальная аналитика бизнес-центра <имя>, <адрес>.
// Обновляется ежемесячно. <что внутри>». Проверяется здесь не красота
// формулировки, а три вещи, из-за которых старый сниппет и переписывался
// поисковиком: заголовок влезает в обрезку выдачи, описание влезает в свой
// бюджет, и перечислены только те разделы, которые у здания реально есть.

const PORT = {
  name: 'Бизнес-центр «Порт»',
  address: 'г. Минск, пр-т Независимости, 177',
  businessClass: 'B+',
  totalArea: 35000,
  yearBuilt: 2011,
  status: 'built',
};

const FULL = {
  organizationCount: 63,
  infrastructure: [],
  rentOfferCount: 3,
  saleOfferCount: 0,
  hasReviews: true,
  hasNearbyInfrastructure: true,
};

// С 2026-10-31 (владелец, «officelist titles») заголовок карточки —
// «БЦ {Название} — независимый обзор[ и арендные ставки] | {месяц} {год}»,
// месяц — месяц сборки по Минску; бюджет — ~65–70 знаков (src/lib/bcTitles.ts).
const MONTH = reviewMonthLabel();

describe('fallbackBusinessCenterMeta — заголовок', () => {
  it('без объявлений аренды/ставок: «БЦ <имя> — независимый обзор | <месяц>»', () => {
    expect(fallbackBusinessCenterMeta(PORT).title).toBe(`БЦ Порт — независимый обзор | ${MONTH}`);
  });

  it('с объявлениями аренды или ставками добавляет «и арендные ставки»', () => {
    expect(fallbackBusinessCenterMeta(PORT, { ...FULL, hasRentData: true }).title).toBe(
      `БЦ Порт — независимый обзор и арендные ставки | ${MONTH}`,
    );
  });

  it('у здания без собственного имени подставляет адрес', () => {
    const meta = fallbackBusinessCenterMeta({
      ...PORT,
      name: 'Бизнес-центр (ул. Жуковского, 11А)',
      address: 'г. Минск, ул. Жуковского, 11А',
    });
    expect(meta.title).toBe(`БЦ на Жуковского, 11А — независимый обзор | ${MONTH}`);
  });

  it('не повторяет адрес', () => {
    const meta = fallbackBusinessCenterMeta({
      ...PORT,
      name: 'Бизнес-центр (ул. Жуковского, 11А)',
      address: 'г. Минск, ул. Жуковского, 11А',
    });
    expect(meta.title.split('Жуковского').length - 1).toBe(1);
  });

  it('второе название остаётся в описании, а не в title', () => {
    const meta = fallbackBusinessCenterMeta({ ...PORT, name: 'Бизнес-центр «V»', altNames: ['Столица'] });
    expect(meta.title).toBe(`БЦ V — независимый обзор | ${MONTH}`);
  });

  // Два РАЗНЫХ здания каталога называются «Порт» — одинаковый title у двух
  // страниц конкурирует сам с собой в выдаче.
  it('у зданий-тёзок дописывает адрес', () => {
    const first = fallbackBusinessCenterMeta({ ...PORT, ambiguousName: true });
    const second = fallbackBusinessCenterMeta({
      ...PORT,
      address: 'г. Минск, ул. Шафарнянская, 11',
      ambiguousName: true,
    });
    expect(first.title).toContain('пр-т Независимости, 177');
    expect(second.title).toContain('ул. Шафарнянская, 11');
    expect(first.title).not.toBe(second.title);
  });

  it('снимает уточнение в скобках из адреса тёзки', () => {
    const meta = fallbackBusinessCenterMeta({
      ...PORT,
      address: 'г. Минск, пр-т Независимости, 177 (мкр. Уручье)',
      ambiguousName: true,
    });
    expect(meta.title).not.toContain('Уручье');
  });

  it('длинное имя: сначала снимается «БЦ », месяц и «независимый обзор» остаются', () => {
    const meta = fallbackBusinessCenterMeta(
      { ...PORT, name: 'Бизнес-центр «Шамбала-Щучинщина Гранд»' },
      { ...FULL, hasRentData: true },
    );
    expect(meta.title.startsWith('БЦ ')).toBe(false);
    expect(meta.title).toContain('независимый обзор');
    expect(meta.title).toContain(MONTH);
  });
});

describe('fallbackBusinessCenterMeta — описание', () => {
  it('собирает формат владельца: аналитика, ежемесячное обновление, состав', () => {
    expect(fallbackBusinessCenterMeta(PORT, FULL).description).toBe(
      'Актуальная аналитика бизнес-центра Порт, пр-т Независимости, 177. Обновляется ежемесячно. ' +
        'Отзывы, каталог из 63 арендаторов, 3 помещения в аренду.',
    );
  });

  // Адрес пишется через запятую, а не с предлогом: улицы в базе лежат в
  // именительном падеже, и «на ул. Московская, 22» — брак.
  it('ставит адрес через запятую, без предлога', () => {
    const meta = fallbackBusinessCenterMeta({ ...PORT, address: 'г. Минск, ул. Московская, 22' }, FULL);
    expect(meta.description).toContain('бизнес-центра Порт, ул. Московская, 22.');
    expect(meta.description).not.toContain('на ул. Московская');
  });

  it('у здания без имени не дописывает адрес второй раз', () => {
    const meta = fallbackBusinessCenterMeta(
      { ...PORT, name: 'Бизнес-центр (ул. Жуковского, 11А)', address: 'г. Минск, ул. Жуковского, 11А' },
      FULL,
    );
    expect(meta.description).toContain('бизнес-центра на Жуковского, 11А.');
    expect(meta.description.split('Жуковского').length - 1).toBe(1);
  });

  // Главное правило формата: не обещать разделов, которых на странице нет —
  // именно за это Google и подменяет описание своим текстом.
  it('не перечисляет разделы, которых у здания нет', () => {
    const meta = fallbackBusinessCenterMeta(PORT, {
      organizationCount: 0,
      infrastructure: [],
      rentOfferCount: 0,
      saleOfferCount: 0,
      hasReviews: false,
      hasNearbyInfrastructure: false,
    });
    expect(meta.description).not.toContain('отзывы');
    expect(meta.description).not.toContain('арендатор');
    expect(meta.description).not.toContain('аренду');
    expect(meta.description).not.toContain('инфраструктура');
    // Без единого числа описания 141 страницы различались бы только именем,
    // поэтому класс с площадью подставляются прямо в «информацию о здании».
    expect(meta.description).toContain('Информация о здании: класс B+, 35 000 м²');
  });

  it('склоняет арендаторов и помещения по числу', () => {
    const forCounts = (tenants: number, rent: number) =>
      fallbackBusinessCenterMeta(PORT, { ...FULL, organizationCount: tenants, rentOfferCount: rent }).description;
    expect(forCounts(1, 1)).toContain('каталог из 1 арендатора');
    expect(forCounts(1, 1)).toContain('1 помещение в аренду');
    expect(forCounts(3, 3)).toContain('3 помещения в аренду');
    expect(forCounts(131, 5)).toContain('каталог из 131 арендатора');
    expect(forCounts(11, 11)).toContain('11 помещений в аренду');
  });

  it('пишет аренду и продажу одной строкой, когда есть и то и другое', () => {
    const meta = fallbackBusinessCenterMeta(PORT, { ...FULL, rentOfferCount: 10, saleOfferCount: 17 });
    expect(meta.description).toContain('10 помещений в аренду и 17 на продажу');
  });

  it('влезает в бюджет сниппета', () => {
    expect(fallbackBusinessCenterMeta(PORT, FULL).description.length).toBeLessThanOrEqual(160);
  });

  // Пять пунктов с адресом в бюджет не помещаются никогда. Снимать их с
  // конца нельзя: первым выпадало бы «N помещений в аренду» — единственная
  // строка, ради которой на такую страницу приходят из поиска.
  it('в тесноте жертвует общими пунктами, а не предложениями', () => {
    const meta = fallbackBusinessCenterMeta(
      { ...PORT, name: 'Бизнес-центр «Александров Пассаж Премиум»' },
      { ...FULL, organizationCount: 128, rentOfferCount: 12, saleOfferCount: 4 },
    );
    expect(meta.description.length).toBeLessThanOrEqual(160);
    expect(meta.description).toContain('12 помещений в аренду и 4 на продажу');
    expect(meta.description).not.toContain('информация о здании');
  });
});

describe('businessCenterHubDescription', () => {
  it('собирает описание подборки в том же формате, что и карточка', () => {
    expect(businessCenterHubDescription('бизнес-центров класса B+ в Минске', 23)).toBe(
      'Актуальная аналитика 23 бизнес-центров класса B+ в Минске. Обновляется ежемесячно. ' +
        'Цены аренды и продажи, отзывы, каталоги арендаторов, инфраструктура рядом.',
    );
  });

  // Число подставляется только когда каталог уже загружен: «0 бизнес-центров»
  // в выдаче хуже, чем описание без числа.
  it('обходится без числа, пока каталог не приехал', () => {
    const meta = businessCenterHubDescription('бизнес-центров Минска', null);
    expect(meta.startsWith('Актуальная аналитика бизнес-центров Минска.')).toBe(true);
  });

  it('влезает в бюджет сниппета даже у самой длинной подборки', () => {
    const longest = businessCenterHubDescription(
      'бизнес-центров класса B+ в Первомайском районе Минска',
      12,
    );
    expect(longest.length).toBeLessThanOrEqual(160);
  });
});
