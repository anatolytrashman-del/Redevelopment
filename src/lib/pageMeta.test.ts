import { describe, it, expect } from 'vitest';
import { businessCenterHubDescription, fallbackBusinessCenterMeta } from './pageMeta';
import { serpTitleWidth, SERP_TITLE_MAX_PX } from './serpTitleWidth';

// Формат сниппета карточки БЦ задал владелец 2026-09-22, увидев страницу в
// выдаче Google: title — «Бизнес-центр <имя> — полный обзор <год>»,
// description — «Актуальная аналитика бизнес-центра <имя>, <адрес>.
// Обновляется ежемесячно. <что внутри>». Проверяется здесь не красота
// формулировки, а три вещи, из-за которых старый сниппет и переписывался
// поисковиком: заголовок влезает в обрезку выдачи, описание влезает в свой
// бюджет, и перечислены только те разделы, которые у здания реально есть.
const YEAR = new Date().getFullYear();

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

describe('fallbackBusinessCenterMeta — заголовок', () => {
  it('собирает «Бизнес-центр <имя> — полный обзор <год>» без кавычек вокруг имени', () => {
    expect(fallbackBusinessCenterMeta(PORT).title).toBe(`Бизнес-центр Порт — полный обзор ${YEAR}`);
  });

  it('у здания без собственного имени подставляет адрес', () => {
    const meta = fallbackBusinessCenterMeta({
      ...PORT,
      name: 'Бизнес-центр (ул. Жуковского, 11А)',
      address: 'г. Минск, ул. Жуковского, 11А',
    });
    expect(meta.title).toBe(`Бизнес-центр на Жуковского, 11А — полный обзор ${YEAR}`);
  });

  // Адрес стоял в заголовке ДВАЖДЫ до 2026-09-22 («Бизнес-центр на
  // Жуковского, 11А — г. Минск, ул. Жуковского, 11А»), и Google переписывал
  // заголовок сам. Повтор не должен вернуться ни в каком виде.
  it('не повторяет адрес', () => {
    const meta = fallbackBusinessCenterMeta({
      ...PORT,
      name: 'Бизнес-центр (ул. Жуковского, 11А)',
      address: 'г. Минск, ул. Жуковского, 11А',
    });
    expect(meta.title.split('Жуковского').length - 1).toBe(1);
  });

  it('ставит второе название здания', () => {
    const meta = fallbackBusinessCenterMeta({ ...PORT, name: 'Бизнес-центр «V»', altNames: ['Столица'] });
    expect(meta.title).toBe(`Бизнес-центр V («Столица») — полный обзор ${YEAR}`);
  });

  it('не дублирует кавычки, если второе название их уже несёт', () => {
    const meta = fallbackBusinessCenterMeta({ ...PORT, altNames: ['«Столица»'] });
    expect(meta.title).toContain('(«Столица»)');
    expect(meta.title).not.toContain('««');
  });

  // Два РАЗНЫХ здания каталога называются «Порт» (пр-т Независимости, 177 и
  // ул. Шафарнянская, 11). Одинаковый title у двух страниц — это две
  // страницы, конкурирующие между собой в выдаче.
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

  it('снимает уточнение в скобках из адреса тёзки — оно стоит 160 пикселей', () => {
    const meta = fallbackBusinessCenterMeta({
      ...PORT,
      address: 'г. Минск, пр-т Независимости, 177 (мкр. Уручье)',
      ambiguousName: true,
    });
    expect(meta.title).not.toContain('Уручье');
    expect(serpTitleWidth(meta.title)).toBeLessThanOrEqual(SERP_TITLE_MAX_PX);
  });

  // Обрезка выдачи съедает ХВОСТ, то есть ровно «— полный обзор <год>».
  // Поэтому длинный заголовок не оставляется как есть, а укорачивается сам.
  it('укорачивается, пока не влезет в обрезку выдачи', () => {
    const meta = fallbackBusinessCenterMeta({
      ...PORT,
      name: 'Бизнес-центр «Шамбала-Щучинщина»',
      altNames: ['Жемчужный Шарм Шоппинг Молл'],
    });
    expect(serpTitleWidth(meta.title)).toBeLessThanOrEqual(SERP_TITLE_MAX_PX);
    expect(meta.title).toContain(String(YEAR));
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
