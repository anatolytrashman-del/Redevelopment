import { describe, expect, it } from 'vitest';
import {
  cleanTenantCategory,
  formatTenantPlacement,
  isTenantAmenity,
  parseTenantPlacement,
  primaryTenantCategory,
  tenantAmenityLabel,
  tenantIndustryFromCategory,
} from './tenantCategories';
import { TENANT_INDUSTRY_LABELS, TENANT_INDUSTRY_OTHER } from '../data/tenantIndustries';
import { YANDEX_TENANT_CATEGORY_SAMPLE } from './__tenantCategorySample';

describe('cleanTenantCategory', () => {
  it('срезает место в здании, прилипшее к рубрике', () => {
    expect(cleanTenantCategory('Крепёжные изделия подъезд 3')).toBe('Крепёжные изделия');
    expect(cleanTenantCategory('Спортивный комплекс секция 3, помещение 22,')).toBe('Спортивный комплекс');
    expect(cleanTenantCategory('Магазин одежды, магазин верхней одежды подъезд 1')).toBe(
      'Магазин одежды, магазин верхней одежды',
    );
  });

  it('оставляет null, если в поле было только место', () => {
    expect(cleanTenantCategory('этаж 1')).toBeNull();
    expect(cleanTenantCategory('этаж цокольный')).toBeNull();
    expect(cleanTenantCategory('')).toBeNull();
    expect(cleanTenantCategory(null)).toBeNull();
  });

  it('чинит висящую запятую', () => {
    expect(cleanTenantCategory('Фармацевтическая компания,')).toBe('Фармацевтическая компания');
  });
});

describe('primaryTenantCategory', () => {
  it('берёт первую рубрику из перечисления', () => {
    expect(primaryTenantCategory('Ветеринарная клиника, ветеринарная лаборатория')).toBe('Ветеринарная клиника');
    expect(primaryTenantCategory('Кафе, ресторан')).toBe('Кафе');
  });
});

describe('isTenantAmenity', () => {
  it('отделяет оборудование от арендаторов', () => {
    expect(isTenantAmenity('Туалет')).toBe(true);
    expect(isTenantAmenity('Кофейный автомат')).toBe(true);
    expect(isTenantAmenity('Обмен валюты, криптомат')).toBe(true);
    expect(isTenantAmenity(null, 'Банкомат Приорбанк')).toBe(true);
  });

  it('парковки и камеры хранения ТЦ — тоже не арендаторы', () => {
    expect(isTenantAmenity('Велопарковка')).toBe(true);
    expect(isTenantAmenity('Автомобильная парковка')).toBe(true);
    expect(isTenantAmenity('Камера хранения')).toBe(true);
    expect(isTenantAmenity('Магазин автозапчастей')).toBe(false);
  });

  it('зарядка электромобилей, инфоцентр, гардероб, комната матери и ребёнка — оборудование ТЦ', () => {
    expect(tenantAmenityLabel('Станция зарядки электромобилей уровень 3 паркинга, ТРЦ Prizma', 'Zaryadka')).toBe(
      'Зарядка электромобилей',
    );
    expect(tenantAmenityLabel('Информационная служба', 'Инфоцентр')).toBe('Инфоцентр');
    expect(tenantAmenityLabel('Информационная служба', 'Information')).toBe('Инфоцентр');
    expect(tenantAmenityLabel('Гардероб', 'Гардероб')).toBe('Гардероб');
    expect(tenantAmenityLabel('Комната матери и ребенка', 'Комната матери и ребенка')).toBe('Комната матери и ребёнка');
  });

  it('не путает их с настоящими арендаторами', () => {
    // «Информационная служба» — рубрика и настоящих компаний в БЦ.
    expect(tenantAmenityLabel('Информационная служба подъезд 4', 'Бизнес инфо')).toBeNull();
    expect(tenantAmenityLabel('Информационная служба', 'Thomson Reuters')).toBeNull();
    expect(tenantAmenityLabel('Турагентство, туристический инфоцентр', 'Alltour.by')).toBeNull();
    expect(tenantAmenityLabel('Гардеробные системы, мебель на заказ', 'Гардеробка бай')).toBeNull();
    expect(tenantAmenityLabel('Магазин одежды', 'Гардероб')).toBeNull();
    expect(tenantAmenityLabel('Электромобили, продажа и сервис, автосалон', 'Voltauto')).toBeNull();
    // Пауэрбанки остаются «Зарядной станцией».
    expect(tenantAmenityLabel('Аренда зарядных устройств', 'Rentbox')).toBe('Зарядная станция');
  });

  it('пункт выдачи — настоящий арендатор, он снимает помещение', () => {
    expect(isTenantAmenity('Пункт выдачи')).toBe(false);
    expect(isTenantAmenity('Кофейня')).toBe(false);
  });
});

describe('tenantIndustryFromCategory', () => {
  it('раскладывает характерные рубрики по отраслям 2GIS', () => {
    const cases: [string, string][] = [
      ['IT-компания', '19532'],
      ['Программное обеспечение', '19532'],
      ['Бухгалтерские услуги', '969'],
      ['Банк', '969'],
      ['Юридические услуги', '969'],
      ['Салон красоты', '5'],
      ['Медцентр, клиника', '5'],
      ['Кофейня', '2'],
      ['Ресторан', '2'],
      ['Логистическая компания', '12'],
      ['Автомобильные грузоперевозки', '12'],
      ['Магазин одежды', '1035'],
      ['Турагентство', '8'],
      ['Фитнес-клуб', '8'],
      ['Рекламное агентство', '7'],
      ['Агентство недвижимости', '9'],
      ['Архитектурное бюро', '9'],
      ['Металлопрокат', '13'],
      ['Промышленное оборудование', '15'],
      ['Учебный центр', '6'],
      ['Автошкола', '6'],
      ['Зоомагазин', '746'],
      ['Системы безопасности и охраны', '1621'],
      ['Кровля и кровельные материалы', '42867'],
      ['Мебель на заказ', '787'],
      ['Автосалон', '42903'],
      ['Бизнес-центр', '112663'],
    ];
    for (const [category, industry] of cases) {
      expect(`${category} → ${tenantIndustryFromCategory(category)}`).toBe(`${category} → ${industry}`);
    }
  });

  it('место в рубрике не мешает определить отрасль', () => {
    expect(tenantIndustryFromCategory('Крепёжные изделия подъезд 3')).toBe('13');
    expect(tenantIndustryFromCategory('Бизнес-центр подъезд 1')).toBe('112663');
  });

  it('незнакомая рубрика уходит в «Другое», а не в случайную отрасль', () => {
    expect(tenantIndustryFromCategory('Абырвалг')).toBe(TENANT_INDUSTRY_OTHER);
    expect(tenantIndustryFromCategory(null)).toBe(TENANT_INDUSTRY_OTHER);
  });

  it('возвращает только отрасли из справочника', () => {
    const known = new Set([...Object.keys(TENANT_INDUSTRY_LABELS), TENANT_INDUSTRY_OTHER]);
    for (const [category] of YANDEX_TENANT_CATEGORY_SAMPLE) {
      expect(known.has(tenantIndustryFromCategory(category))).toBe(true);
    }
  });

  // Главная проверка файла: «Другое» — это остаток, а не самая большая
  // отрасль диаграммы. Считаем по организациям, а не по рубрикам.
  //
  // Верхняя граница высокая (четверть) по честной причине: 871 организация из
  // 5815 сидит в рубрике «Офис организации», и это не промах карты, а
  // отсутствие данных — Яндекс про такую организацию не говорит ничего, кроме
  // того, что это офис. Поэтому вторая проверка строже и смотрит только на
  // рубрики, у которых отрасль в принципе есть: там «Другое» — уже настоящий
  // промах, и расти ему нельзя.
  const GENERIC_CATEGORIES = new Set(['Офис организации', 'Оптовая компания', 'Офис продаж', 'Производственное предприятие', 'прочее']);

  it('оставляет в «Другом» не больше четверти организаций', () => {
    let total = 0;
    let other = 0;
    for (const [category, count] of YANDEX_TENANT_CATEGORY_SAMPLE) {
      total += count;
      if (tenantIndustryFromCategory(category) === TENANT_INDUSTRY_OTHER) other += count;
    }
    expect(total).toBeGreaterThan(5000);
    expect(other / total).toBeLessThan(0.25);
  });

  it('по содержательным рубрикам промахов почти нет', () => {
    let total = 0;
    let other = 0;
    for (const [category, count] of YANDEX_TENANT_CATEGORY_SAMPLE) {
      const clean = cleanTenantCategory(category);
      if (!clean || GENERIC_CATEGORIES.has(clean) || isTenantAmenity(category)) continue;
      total += count;
      if (tenantIndustryFromCategory(category) === TENANT_INDUSTRY_OTHER) other += count;
    }
    expect(total).toBeGreaterThan(4000);
    expect(other / total).toBeLessThan(0.06);
  });
});

describe('parseTenantPlacement', () => {
  it('достаёт этаж, офис и подъезд из текста карточки', () => {
    expect(parseTenantPlacement('Фото Альфа-Вет Рейтинг 5,0 Открыто Ветеринарная клиника этаж цокольный')).toEqual({
      floor: 'цокольный',
      office: null,
      entrance: null,
    });
    expect(parseTenantPlacement('Магазин одежды офис 401, этаж 4')).toEqual({
      floor: '4',
      office: '401',
      entrance: null,
    });
    expect(parseTenantPlacement('Спортивный комплекс секция 3, помещение 22, этаж цокольный')).toEqual({
      floor: 'цокольный',
      office: '22',
      entrance: '3',
    });
  });

  it('пустой текст — пустое место, без выдуманного этажа', () => {
    expect(parseTenantPlacement(null)).toEqual({ floor: null, office: null, entrance: null });
    expect(formatTenantPlacement({ floor: null, office: null, entrance: null })).toBeNull();
  });

  it('собирает человеческую подпись', () => {
    expect(formatTenantPlacement({ floor: '4', office: '401', entrance: null })).toBe('4 этаж, офис 401');
    expect(formatTenantPlacement({ floor: 'цокольный', office: null, entrance: null })).toBe('цокольный этаж');
  });
});
