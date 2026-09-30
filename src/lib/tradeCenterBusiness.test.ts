import { describe, expect, it } from 'vitest';
import galleria from './__fixtures__/tc-business-galleria.json';
import { advertisingMedium, compactAudience, leasingFormats, leasingSectionSize, parseBusinessContacts } from './tradeCenterBusiness';
import { normalizeRetailInfo, pitchFaqAnswer, retailSectionGroup, retailSectionIds, retailSectionSize } from './tradeCenterRetail';
import { estimateSectionHeight } from './businessCenterPageLayout';

const info = normalizeRetailInfo(galleria)!;

describe('аренда и реклама Galleria', () => {
  it('отделяет телефон, почту и часы', () => {
    expect(parseBusinessContacts(info.leasing?.contacts)).toMatchObject({
      phones: [{ label: '+375 (44) 597-18-88', href: 'tel:+375445971888' }],
      emails: [{ label: 'arenda@galleriaminsk.com', href: 'mailto:arenda@galleriaminsk.com' }],
      hours: 'будни 08:30–17:30',
    });
    expect(parseBusinessContacts(info.advertising?.contacts).phones[0].href).toBe('tel:+375293091569');
    expect(parseBusinessContacts(null)).toEqual({ phones: [], emails: [], hours: null, rest: '' });
    expect(parseBusinessContacts('a@tc.by; b@tc.by, +375 29 111-22-33; +375 44 222-33-44').phones).toHaveLength(2);
    expect(parseBusinessContacts('a@tc.by; b@tc.by').emails).toHaveLength(2);
  });
  it('выделяет два формата, сохраняя почту Trend Park и убирая телефоны', () => {
    const formats = leasingFormats(info.leasing);
    expect(formats).toHaveLength(2);
    expect(formats[1].title).toBe('Trend Park, 5 этаж · 700 м²');
    expect(formats[1].text).toContain('trendpark@galleriaminsk.com');
    expect(JSON.stringify(formats)).not.toMatch(/375|Кабинет|Трафик/);
    expect(leasingFormats(null)).toEqual([]);
  });
  it('сокращает все пять показателей, неизвестные оставляет как есть', () => {
    expect(info.audience.map(compactAudience).map((tile) => tile.value)).toEqual(['30 тыс.+', '40–50 тыс.', '1 млн+', '70%', '25–35']);
    expect(compactAudience(info.audience[4]).label).toBe('лет у 80% посетителей');
    expect(compactAudience({ label: 'Трафик', value: 'Сезонный' }).value).toBe('Сезонный');
  });
  it('разделяет носители и назначает иконки', () => {
    const media = info.advertising!.points.map(advertisingMedium);
    expect(media.map((m) => m.icon)).toEqual(['monitor', 'play', 'volume', 'image', 'car', 'sparkles']);
    expect(media[0]).toMatchObject({ title: 'LED-экран на фасаде', text: '24 × 13 м, 323,28 м²' });
    expect(media[1]).toMatchObject({ title: '11 видеоэкранов', text: 'у лифтов и на фудкорте' });
    expect(advertisingMedium('Иной носитель')).toEqual({ title: 'Иной носитель', text: '', icon: 'megaphone' });
  });
  it('заменяет business, сохраняет FAQ и учитывает высоты', () => {
    expect(retailSectionIds(info)).toEqual(['advertising']);
    expect(retailSectionGroup('advertising')).toBe('business');
    expect(retailSectionSize(info, 'advertising')).toBe(12);
    expect(retailSectionIds(normalizeRetailInfo({ leasing: galleria.leasing }))).toEqual([]);
    expect(retailSectionIds(normalizeRetailInfo({ audience: galleria.audience }))).toEqual(['advertising']);
    expect(pitchFaqAnswer(info.leasing)).toContain('arenda@galleriaminsk.com');
    expect(pitchFaqAnswer(info.advertising)).toContain('reklama@galleriaminsk.com');
    expect(estimateSectionHeight({ id: 'offers', items: 100, extraHeight: leasingSectionSize(info.leasing) * 41 }) - estimateSectionHeight({ id: 'offers', items: 100 })).toBe(328);
  });
});
