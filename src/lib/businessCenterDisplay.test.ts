import { describe, expect, it } from 'vitest';
import {
  BC_PHOTO_VERSION,
  businessCenterHomepageUrl,
  businessCenterPhotoSrc,
  withBcPhotoVersion,
} from './businessCenterDisplay';

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

// Фото БЦ кэшируются на 30 дней по постоянным именам, поэтому при замене
// пакета снимков адрес обязан меняться — иначе вернувшийся посетитель месяц
// видит старую картинку (живой случай 2026-09-20).
describe('версия в адресе фото БЦ', () => {
  it('дописывает версию к webp обоих вариантов', () => {
    expect(businessCenterPhotoSrc('/images/business-centers/parus.jpg', 'card')).toBe(
      `/images/business-centers/parus-card.webp?v=${BC_PHOTO_VERSION}`,
    );
    expect(businessCenterPhotoSrc('/images/business-centers/parus.jpg', 'detail')).toBe(
      `/images/business-centers/parus.webp?v=${BC_PHOTO_VERSION}`,
    );
  });

  it('дописывает версию к jpeg — он идёт в og:image и разметку Place', () => {
    expect(withBcPhotoVersion('/images/business-centers/parus.jpg')).toBe(
      `/images/business-centers/parus.jpg?v=${BC_PHOTO_VERSION}`,
    );
  });

  it('не трогает чужие пути — загрузки из Supabase Storage', () => {
    const external = 'https://iohcdylttyuhwovztrbk.supabase.co/storage/v1/object/public/object-photos/x.jpg';
    expect(withBcPhotoVersion(external)).toBe(external);
    expect(businessCenterPhotoSrc(external, 'card')).toBe(external);
  });
});

