import { describe, expect, it } from 'vitest';
import { isSameSupplier, normalizeSupplierName } from './supplierResearch';

// Отождествление поставщиков: по нему показывается подсказка «похоже, это
// дубль» и по нему же (через api/_invoiceRouting.js) загруженный вручную счёт
// находит свою карточку.
describe('normalizeSupplierName', () => {
  it('снимает русскую форму собственности — ту самую, что не снимала регулярка с \\b', () => {
    expect(normalizeSupplierName('ООО «Петрович»')).toBe('петрович');
    expect(normalizeSupplierName('Петрович')).toBe('петрович');
    expect(normalizeSupplierName('ЧТУП "Строй Дом"')).toBe('строй дом');
  });

  it('ё и е — одна буква, регистр и кавычки не считаются', () => {
    expect(normalizeSupplierName('ЗАО «Клён»')).toBe(normalizeSupplierName('Клен'));
  });

  it('название из одной только формы не превращается в совпадение со всем подряд', () => {
    expect(normalizeSupplierName('ООО')).toBe('');
  });
});

const base = { name: '', email: '', websiteUrl: '', inn: null as string | null, country: '' };

describe('isSameSupplier', () => {
  it('одно название с формой и без — одна компания', () => {
    expect(isSameSupplier({ ...base, name: 'ООО «Петрович»' }, { ...base, name: 'Петрович' })).toBe(true);
  });

  it('пустое название не отождествляет две безымянные карточки', () => {
    expect(isSameSupplier({ ...base, name: 'ООО' }, { ...base, name: 'ЗАО' })).toBe(false);
  });

  it('разные страны при одном названии — разные компании', () => {
    expect(
      isSameSupplier(
        { ...base, name: 'ООО «ТехноСтрой»', country: 'Беларусь' },
        { ...base, name: 'ТехноСтрой', country: 'Россия' },
      ),
    ).toBe(false);
  });
});
