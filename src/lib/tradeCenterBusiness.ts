import type { RetailFigureEntry, RetailPitch } from '../data/businessCenters';

const PHONE_RE = /(?:\+\d{1,3}|8)[\s(-]*\d{2,3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const clean = (text: string) => text.replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, '').trim();

export function parseBusinessContacts(text: string | null | undefined) {
  const value = text ?? '';
  const phones = [...new Set(value.match(PHONE_RE) ?? [])].map((label) => ({ label, href: `tel:${label.replace(/[^\d+]/g, '')}` }));
  const emails = [...new Set(value.match(EMAIL_RE) ?? [])].map((label) => ({ label, href: `mailto:${label}` }));
  const rest = clean(value.replace(PHONE_RE, '').replace(EMAIL_RE, ''));
  const hours = rest.match(/(?:(?:будни|ежедневно|выходные|пн\s*[–-]\s*пт|пн\s*[–-]\s*вс)\s*[:,]?\s*)?\d{1,2}[:.]\d{2}\s*[–—-]\s*\d{1,2}[:.]\d{2}/i)?.[0] ?? null;
  return { phones, emails, hours, rest };
}

export interface BusinessCardText { title: string; text: string }

export function leasingFormats(pitch: RetailPitch | null): BusinessCardText[] {
  return (pitch?.points ?? []).flatMap((point) => {
    if (!/остров|корнер|пространств|м²/i.test(point) || /кабинет арендатора|форм[ау] на сайте|трафик/i.test(point)) return [];
    // Смешанный пункт делим на форматы, контакты площадки сохраняем (владелец, 2026-09-25).
    return point.split(/,\s*(?=на \d+ этаже)/i).map((part) => {
      const text = clean(part.replace(PHONE_RE, '').replace(/,\s*\)/g, ')'));
      const named = text.match(/пространстве\s+([^()]+)\s*\(([^)]*)\)/i);
      if (named) {
        const floor = text.match(/на (\d+) этаже/i)?.[1];
        const area = named[2].match(/[\d\s.,]+\s*м²/)?.[0].trim();
        const title = [named[1].trim().replace(/TREND PARK/i, 'Trend Park'), [floor && `${floor} этаж`, area].filter(Boolean).join(' · ')].filter(Boolean).join(', ');
        return { title, text: clean(text.replace(/на \d+ этаже\s*[—–-]?\s*/i, '').replace(named[0], '').replace(/\s+в\s*$/, '').replace(/,\s*$/, '')) + (parseBusinessContacts(part).emails.length ? `, свой контакт: ${parseBusinessContacts(part).emails.map((e) => e.label).join(', ')}` : '') };
      }
      const split = text.search(/\s+[—–:]\s+|:\s*/);
      if (split > 0) return { title: text.slice(0, split), text: clean(text.slice(split)) };
      if (/остров/i.test(text)) return { title: 'Островные места', text };
      if (/корнер/i.test(text)) return { title: 'Корнеры', text };
      return { title: 'Отдельные пространства', text };
    });
  });
}

export function compactAudience(entry: Pick<RetailFigureEntry, 'label' | 'value'>) {
  const age = entry.value.match(/^(\d+)%\s*посетителей\s*[—–-]\s*(\d+\s*[–-]\s*\d+)\s*лет$/i);
  if (age) return { value: age[2], label: `лет у ${age[1]}% посетителей` };
  const count = entry.value.match(/^(более|больше)\s+([\d\s.,–-]+\s*(?:тыс\.|млн))(?:\s+в день)?$/i);
  return { value: count ? `${count[2]}${/[–-]/.test(count[2]) ? '' : '+'}` : entry.value, label: entry.label.toLocaleLowerCase('ru-RU') };
}

export type AdvertisingIcon = 'monitor' | 'play' | 'volume' | 'image' | 'car' | 'sparkles' | 'megaphone';
export function advertisingMedium(point: string): BusinessCardText & { icon: AdvertisingIcon } {
  const icon: AdvertisingIcon = /видео/i.test(point) ? 'play' : /экран|LED/i.test(point) ? 'monitor' : /аудио/i.test(point) ? 'volume' : /баннер|оклейка|лайтбокс/i.test(point) ? 'image' : /авто/i.test(point) ? 'car' : /промо|дегустац/i.test(point) ? 'sparkles' : 'megaphone';
  // Размеры отделяем после названия носителя, начальное количество оставляем (владелец, 2026-09-25).
  if (icon === 'car') return { icon, title: /у.*вход/i.test(point) ? 'Авто у входа' : 'Автомобили', text: point };
  if (icon === 'sparkles') return { icon, title: 'Промо', text: point };
  if (icon === 'image' && /баннер/i.test(point) && /оклейка/i.test(point)) return { icon, title: 'Баннеры и оклейка', text: point };
  const size = point.search(/\s+\d+[\d.,]*\s*(?:[×xх]|м(?:²|\s|$))/i);
  const split = size > 0 ? size : point.search(/\s+(?:в|во|на|у|для|с)\s+|,\s*/i);
  return split > 0 ? { icon, title: point.slice(0, split), text: clean(point.slice(split)) } : { icon, title: point, text: '' };
}

export function leasingSectionSize(pitch: RetailPitch | null): number {
  return pitch ? Number(Boolean(pitch.contacts)) * 4 + Math.ceil(leasingFormats(pitch).length / 2) * 4 : 0;
}
