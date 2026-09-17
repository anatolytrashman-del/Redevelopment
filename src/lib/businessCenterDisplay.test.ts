import { describe, expect, it } from 'vitest';
import { businessCenterHomepageUrl } from './businessCenterDisplay';

describe('businessCenterHomepageUrl', () => {
  it('сводит вложенную страницу БЦ к главной странице сайта', () => {
    expect(
      businessCenterHomepageUrl('https://a1development.by/arenda/biznes-centr-port-1-ya-i-2-aya-ocheredi'),
    ).toBe('https://a1development.by/');
  });

  it('добавляет безопасный протокол адресу из админки', () => {
    expect(businessCenterHomepageUrl('iv-company.by/about')).toBe('https://iv-company.by/');
  });

  it('использует проверенный рабочий вариант домена', () => {
    expect(businessCenterHomepageUrl('https://www.strateg.by/objects/1')).toBe('https://strateg.by/');
  });

  it('скрывает проверенный нерабочий сайт и некорректный URL', () => {
    expect(businessCenterHomepageUrl('https://sit.by')).toBeNull();
    expect(businessCenterHomepageUrl('https://')).toBeNull();
  });
});
