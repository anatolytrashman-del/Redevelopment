import { describe, expect, it } from 'vitest';
import { identifyingHost, matchOffers, normalizeCompanyName, scoreCandidate } from './_invoiceRouting.js';

describe('normalizeCompanyName', () => {
  it('снимает форму собственности, кавычки и регистр', () => {
    expect(normalizeCompanyName('ООО «СтройДом»')).toBe('стройдом');
    expect(normalizeCompanyName('СТРОЙДОМ, ООО')).toBe('стройдом');
    expect(normalizeCompanyName('ЧТУП "Строй Дом"')).toBe('строй дом');
  });

  it('пустое значение не превращает в мусор', () => {
    expect(normalizeCompanyName(null)).toBe('');
    expect(normalizeCompanyName('   ')).toBe('');
  });
});

describe('identifyingHost', () => {
  it('достаёт домен и из сайта, и из почты', () => {
    expect(identifyingHost('https://www.keramogranit.by/catalog')).toBe('keramogranit.by');
    expect(identifyingHost('Sales@Keramogranit.by')).toBe('keramogranit.by');
  });

  it('не опознаёт компанию по бесплатному почтовику', () => {
    expect(identifyingHost('supplier777@mail.ru')).toBe(null);
    expect(identifyingHost('info@gmail.com')).toBe(null);
  });
});

const OFFERS = [
  { id: 'o1', request_id: 'r1', name: 'ООО «Керамогранит»', inn: '7707083893', email: 'sales@keramogranit.by', website_url: 'https://keramogranit.by' },
  { id: 'o2', request_id: 'r2', name: 'Стройдом', inn: null, email: 'zakaz@stroydom.ru', website_url: '' },
  { id: 'o3', request_id: 'r3', name: 'Альфа', inn: null, email: 'alfa777@mail.ru', website_url: '' },
];

describe('matchOffers', () => {
  it('ИНН важнее названия: совпал — дальше не гадаем', () => {
    const found = matchOffers(OFFERS, { inn: '7707083893', name: 'Совсем другое имя' });
    expect(found.matchedBy).toBe('inn');
    expect(found.offers.map((o) => o.id)).toEqual(['o1']);
  });

  it('находит по названию без формы собственности', () => {
    const found = matchOffers(OFFERS, { inn: '', name: 'ООО "СТРОЙДОМ"' });
    expect(found.matchedBy).toBe('name');
    expect(found.offers.map((o) => o.id)).toEqual(['o2']);
  });

  it('находит по домену почты, когда ни ИНН, ни названия нет', () => {
    const found = matchOffers(OFFERS, { inn: '', name: '', email: 'manager@keramogranit.by' });
    expect(found.matchedBy).toBe('site');
    expect(found.offers.map((o) => o.id)).toEqual(['o1']);
  });

  it('по бесплатному почтовику не находит никого', () => {
    const found = matchOffers(OFFERS, { inn: '', name: '', email: 'someone@mail.ru' });
    expect(found.matchedBy).toBe(null);
    expect(found.offers).toEqual([]);
  });

  it('несовпадение по всем трём признакам — пусто, а не «первый попавшийся»', () => {
    const found = matchOffers(OFFERS, { inn: '9999999999', name: 'Неизвестная компания', email: 'x@unknown.io' });
    expect(found.offers).toEqual([]);
  });
});

describe('scoreCandidate (запасной выбор поставки без модели)', () => {
  const paints = {
    request: { id: 'r1', title: 'Краски, обои и декоративные покрытия', section_title: 'Отделка' },
    positions: [{ name: 'Краска матовая для потолков моющаяся' }, { name: 'Грунтовка глубокого проникновения' }],
  };
  const tiles = {
    request: { id: 'r2', title: 'Керамогранит и плитка', section_title: '' },
    positions: [{ name: 'Керамогранит 600х600 серый' }],
  };
  const recognized = { items: [{ name: 'Краска интерьерная моющаяся Tikkurila' }] };

  it('поставка с совпадающими словами набирает больше', () => {
    expect(scoreCandidate(recognized, paints)).toBeGreaterThan(scoreCandidate(recognized, tiles));
  });

  it('счёт без позиций не даёт ложной уверенности', () => {
    expect(scoreCandidate({ items: [] }, paints)).toBe(0);
  });
});
