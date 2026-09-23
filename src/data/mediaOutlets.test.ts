import { describe, expect, it } from 'vitest';
import { mediaOutlets, outletBrand, outletDomain } from './mediaOutlets';

describe('outletDomain', () => {
  it('сводит поддомены издания к одному ключу', () => {
    // Ради этого функция и существует: у Onliner материалы про недвижимость
    // и деньги лежат на разных поддоменах, а логотип один.
    expect(outletDomain('https://realt.onliner.by/2025/05/18/it-xab')).toBe('onliner.by');
    expect(outletDomain('https://money.onliner.by/2025/02/13/biznes-xab')).toBe('onliner.by');
    expect(outletDomain('https://onliner.by/')).toBe('onliner.by');
  });

  it('снимает www', () => {
    expect(outletDomain('https://www.belta.by/economics/view/x-123')).toBe('belta.by');
  });

  it('не падает на мусорной ссылке', () => {
    expect(outletDomain('не ссылка')).toBe('');
    expect(outletDomain('')).toBe('');
  });
});

describe('outletBrand', () => {
  it('находит бренд по ссылке на статью', () => {
    expect(outletBrand('https://belta.by/society/view/x-522637-2022/')?.name).toBe('БелТА');
  });

  it('возвращает null для издания не из реестра — блок покажет название текстом', () => {
    expect(outletBrand('https://example.com/news/1')).toBeNull();
  });
});

describe('реестр изданий', () => {
  it('ключи — домены в нижнем регистре без www и без пути', () => {
    for (const key of Object.keys(mediaOutlets)) {
      expect(key).toBe(key.toLowerCase());
      expect(key.startsWith('www.')).toBe(false);
      expect(key).not.toContain('/');
    }
  });

  it('у каждого издания есть читаемое название', () => {
    for (const [key, brand] of Object.entries(mediaOutlets)) {
      expect(brand.name.trim(), key).not.toBe('');
    }
  });

  it('путь к логотипу ведёт в public/media-logos и это png', () => {
    // Владелец просил именно PNG без фона; ссылка на чужой сервер сюда
    // попасть не должна — логотипы храним у себя.
    for (const [key, brand] of Object.entries(mediaOutlets)) {
      if (brand.logo === null) continue;
      expect(brand.logo, key).toMatch(/^\/media-logos\/[a-z0-9-]+\.png$/);
    }
  });
});
