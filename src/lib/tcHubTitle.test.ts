import { describe, expect, it } from 'vitest';
import {
  districtGenitive,
  tcDistrictHubPhrase,
  tcHubTitle,
  tcMetroHubPhrase,
  tcRootTitle,
  tcCatalogTitle,
  tcTopicHubPhrase,
  TC_HUB_TITLE_MAX_CHARS,
} from './tcHubTitle';
import { replaceReviewMonth, tcReviewTitle, tcTitleName, tcReviewDescription } from './tcReviewTitle';

const NOV = new Date('2026-11-15T12:00:00Z');
const DEC = new Date('2026-12-01T00:30:00+03:00');

describe('tcReviewTitle', () => {
  it('builds card title with nominative lowercase month', () => {
    expect(tcReviewTitle('ТРЦ «Galleria Minsk»', NOV)).toBe('ТЦ Galleria Minsk — независимый обзор | ноябрь 2026');
  });
  it('drops «ТЦ » only when over 60 chars', () => {
    const t = tcReviewTitle('Торговый центр «ProStore на Дзержинского»', NOV);
    const full = 'ТЦ ProStore на Дзержинского — независимый обзор | ноябрь 2026';
    expect(t).toBe(full.length > 60 ? full.slice(3) : full);
    expect(tcReviewTitle('ТЦ «Мост»', NOV)).toBe('ТЦ Мост — независимый обзор | ноябрь 2026');
  });
  it('strips quotes and prefixes', () => {
    expect(tcTitleName('Торговый центр «Мост»')).toBe('Мост');
  });
  it('uses Minsk calendar for month boundary', () => {
    expect(tcReviewTitle('ТЦ «Мост»', DEC)).toContain('декабрь 2026');
  });
  it('omits zero counts in description', () => {
    expect(tcReviewDescription(0, 0)).toBe(
      'Магазины по этажам, где поесть и припарковаться, отзывы посетителей, факты и сравнение с соседними ТЦ Минска.',
    );
  });
});

describe('replaceReviewMonth', () => {
  it('replaces every review/reference month occurrence', () => {
    const html =
      '<title>ТЦ Мост — независимый обзор | октябрь 2026</title><meta property="og:title" content="Все 139 ТЦ Минска — независимый справочник | октябрь 2026">';
    const out = replaceReviewMonth(html, NOV);
    expect(out).not.toContain('октябрь');
    expect(out.match(/ноябрь 2026/g)).toHaveLength(2);
  });
  it('leaves unrelated months alone', () => {
    expect(replaceReviewMonth('Обновлено: октябрь 2026', NOV)).toBe('Обновлено: октябрь 2026');
  });
});

describe('tcHubTitle', () => {
  it('metro', () => {
    expect(tcHubTitle(tcMetroHubPhrase('Автозаводская', 4), NOV)).toBe(
      '4 ТЦ у метро Автозаводская — независимый обзор | ноябрь 2026',
    );
  });
  it('district genitive', () => {
    expect(districtGenitive('Фрунзенский')).toBe('Фрунзенского района');
    expect(districtGenitive('Минский район')).toBe('Минского района');
    expect(tcHubTitle(tcDistrictHubPhrase('Фрунзенский', 12), NOV)).toBe(
      '12 ТЦ Фрунзенского района — независимый обзор | ноябрь 2026',
    );
  });
  it('N=1 has no digit and agrees', () => {
    expect(tcHubTitle(tcDistrictHubPhrase('Заводской', 1), NOV)).toBe(
      'ТЦ Заводского района — независимый обзор | ноябрь 2026',
    );
    expect(tcTopicHubPhrase('budget', 1)).toBe('недорогой ТЦ Минска');
    expect(tcTopicHubPhrase('budget', 54)).toBe('54 недорогих ТЦ Минска');
    expect(tcTopicHubPhrase('budget', 21)).toBe('21 недорогой ТЦ Минска');
  });
  it('shortens: торговые центры → ТЦ, then without Минска', () => {
    const long = 'торговые центры Минска с бесплатной парковкой у вокзала';
    const t = tcHubTitle(long, NOV);
    expect(t).toContain('независимый обзор | ноябрь 2026');
    expect(t).not.toContain('торговые центры');
  });
  it('keeps titles ≤ 65 for all topic hubs', () => {
    for (const slug of ['shopping', 'railway-station', 'underground', 'center', 'metro', 'belarusian', 'cinema', 'kids', 'entertainment', 'foodcourt', 'parking', 'free-parking', 'budget', 'shoes', 'menswear', 'ice-rink']) {
      const t = tcHubTitle(tcTopicHubPhrase(slug, 99)!, NOV);
      expect(t.length, t).toBeLessThanOrEqual(TC_HUB_TITLE_MAX_CHARS);
    }
  });
  it('root and catalog differ', () => {
    expect(tcRootTitle(139, NOV)).toBe('Все 139 ТЦ Минска — независимый справочник | ноябрь 2026');
    expect(tcCatalogTitle(139)).toBe('Торговые центры Минска — каталог всех 139 ТЦ');
  });
});
