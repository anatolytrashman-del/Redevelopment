import { readdirSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BC_CARD_PHOTO_WIDTHS,
  BC_PHOTO_VERSION,
  businessCenterCardPhotoSrcSet,
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


// srcset карточки ссылается на уменьшенные копии по имени — если копии для
// нового фото не сгенерированы, браузер выберет несуществующий файл и
// покажет битую картинку (на src он при этом НЕ откатывается). Поэтому
// наличие копий проверяет тест, а не память: добавил фото — прогони
// `node scripts/generate-card-image-variants.mjs`.
describe('уменьшенные копии карточных фото', () => {
  const dir = new URL('../../public/images/business-centers/', import.meta.url);

  it('у каждого -card.webp есть копии всех ширин из srcset', () => {
    const cards = readdirSync(dir).filter((f) => f.endsWith('-card.webp'));
    expect(cards.length).toBeGreaterThan(100);
    const missing: string[] = [];
    for (const card of cards) {
      for (const width of BC_CARD_PHOTO_WIDTHS) {
        const variant = card.replace('-card.webp', `-card-${width}.webp`);
        if (!existsSync(new URL(variant, dir))) missing.push(variant);
      }
    }
    expect(missing).toEqual([]);
  });

  it('srcset перечисляет все ширины и оригинал', () => {
    const srcSet = businessCenterCardPhotoSrcSet('/images/business-centers/futuris.jpg');
    expect(srcSet).toContain('-card-320.webp');
    expect(srcSet).toContain('-card-512.webp');
    expect(srcSet).toMatch(/-card\.webp\?v=\d+ 640w$/);
  });

  it('у чужих путей (Supabase Storage) srcset нет', () => {
    expect(businessCenterCardPhotoSrcSet('https://example.com/photo.webp')).toBeUndefined();
  });
});
