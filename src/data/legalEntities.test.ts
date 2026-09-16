import { describe, expect, it } from 'vitest';
import { deliveryAddressFromInfo } from './legalEntities';

describe('deliveryAddressFromInfo', () => {
  it('берёт строку «Адрес объекта:» из живого текста ООО «Матрёшка»', () => {
    const info = [
      'Адрес объекта: Московская область, Богородский г. о., поселок Зеленый, 1-й геологический проезд, дом 1',
      '',
      'Возможна доставка машинами до 20 тонн с боковой разгрузкой. Разгрузка осуществляется нами самостоятельно.',
    ].join('\n');
    expect(deliveryAddressFromInfo(info)).toBe(
      'Московская область, Богородский г. о., поселок Зеленый, 1-й геологический проезд, дом 1',
    );
  });

  it('понимает другие формулировки пометки', () => {
    expect(deliveryAddressFromInfo('Адрес доставки:  Минск, Тимирязева 65Б ')).toBe('Минск, Тимирязева 65Б');
    expect(deliveryAddressFromInfo('Адрес: Минск')).toBe('Минск');
  });

  it('без пометки не выдумывает адрес из первой строки', () => {
    expect(deliveryAddressFromInfo('Возможна доставка машинами до 20 тонн с боковой разгрузкой.')).toBe('');
    expect(deliveryAddressFromInfo('')).toBe('');
  });

  it('пустое значение после двоеточия не считается адресом', () => {
    expect(deliveryAddressFromInfo('Адрес объекта:\nВозможна доставка')).toBe('');
  });
});
