import type { RetailEventEntry, RetailHoursEntry, RetailInfo, RetailLoyaltyEntry, RetailParking, RetailTransportEntry } from '../data/businessCenters';
import { MINSK_METRO_LINES } from './businessCenterCatalogFilter';
import { pluralRu } from './pluralRu';

const clean = (text: string) => text.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
const capitalized = (text: string) => text ? text[0].toUpperCase() + text.slice(1) : '';

export function firstSentence(text: string): string {
  return text.trim().split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z])/u)[0];
}

export function shortVisitText(text: string, limit = 160): string {
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit);
  const end = [...prefix.matchAll(/[.!?](?=\s|$)/g)].at(-1)?.index;
  return end != null ? prefix.slice(0, end + 1) : `${prefix.replace(/\s+\S*$/, '').trimEnd()}…`;
}

export function routeNumbers(text: string): string[] {
  const routes = text.split(/останов|[«“„"]/iu)[0];
  return [...new Set([...routes.matchAll(/(?<![\p{L}\d])\d+[\p{L}]?(?:-[\p{L}]+)?(?![\p{L}\d])/gu)].map((m) => m[0]))];
}

export function metroStations(text: string) {
  const pattern = /[«“"]([^»”"]+)[»”"]\s*[—–−:,-]?\s*(\d+(?:[.,]\d+)?)\s*(км|м)(?![\p{L}])/gu;
  const stations = [...text.matchAll(pattern)].map((m) => ({ name: m[1], distance: `${m[2]} ${m[3]}` }));
  // Без кавычек ищем известные станции, чтобы не принять пояснение за название (владелец, 2026-09-25).
  for (const line of MINSK_METRO_LINES) {
    for (const name of line.stations) {
      const match = text.match(new RegExp(`${name}\\s*[—–−:,\\-]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(км|м)(?![\\p{L}])`, 'iu'));
      if (match && !stations.some((s) => s.name.toLowerCase() === name.toLowerCase())) stations.push({ name, distance: `${match[1]} ${match[2]}` });
    }
  }
  return stations.map((station) => ({ ...station, line: MINSK_METRO_LINES.find((l) => l.stations.some((name) => name.toLowerCase() === station.name.toLowerCase()))?.id ?? null }));
}

export function transportForVisit(entries: RetailTransportEntry[]) {
  const metro = new Map<string, ReturnType<typeof metroStations>[number]>();
  const routes = new Map<string, string[]>();
  const transfers: { label: string; text: string }[] = [];
  const labels: Record<string, string> = { bus: 'Автобус', trolleybus: 'Троллейбус', minibus: 'Маршрутка', tram: 'Трамвай' };
  for (const entry of entries) {
    if (entry.mode === 'car' || entry.mode === 'walk') continue;
    if (entry.mode === 'metro') for (const station of metroStations(entry.text)) metro.set(station.name.toLowerCase(), station);
    const sentences = entry.text.split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z])/u);
    const transfer = sentences.find((s) => /аэропорт|вокзал/iu.test(s));
    if (transfer) {
      const label = /аэропорт/iu.test(transfer) ? 'Из аэропорта' : 'С вокзала';
      const text = firstSentence(transfer).replace(/^(?:из аэропорта|с (?:железнодорожного )?вокзала)\s*[—–-]?\s*/iu, '');
      if (!transfers.some((t) => t.label === label && t.text === text)) transfers.push({ label, text });
    }
    if (labels[entry.mode] && !transfer) routes.set(entry.mode, [...new Set([...(routes.get(entry.mode) ?? []), ...routeNumbers(entry.text)])]);
  }
  return {
    metro: [...metro.values()],
    routes: Object.entries(labels).flatMap(([mode, label]) => routes.get(mode)?.length ? [{ label, numbers: routes.get(mode)! }] : []),
    transfers,
  };
}

export function parkingForVisit(parking: RetailParking | null, hours: RetailHoursEntry[] = []) {
  if (!parking) return null;
  const item = (pattern: RegExp) => parking.items.find((i) => pattern.test(i.label) && i.value.trim());
  const entry = item(/въезд/iu)?.value;
  const entrance = entry ? (entry.match(/въезд\s+(.+)/iu)?.[1] ?? entry).replace(/[.;]+$/, '') : '';
  const allDay = /круглосуточ|24\s*\/\s*7/iu.test(parking.summary) || hours.some((h) => /паркинг|парков/iu.test(h.zone) && /круглосуточ|24\s*\/\s*7/iu.test(h.value));
  const spaces = item(/мест/iu);
  const tiles = [
    ...(spaces ? [{ value: spaces.value, label: `мест${allDay ? ', круглосуточно' : ''}` }] : []),
    ...[/перв/iu, /следующ/iu].flatMap((re) => { const row = item(re); return row ? [{ value: row.value, label: row.label.toLowerCase() }] : []; }),
  ];
  const free = parking.items.filter((i) => /^бесплатно|электромобил/iu.test(i.label) && i.value.trim()).map((i) => {
    const label = i.label.replace(/^бесплатно\s*/iu, '').replace(/^электромобили$/iu, 'Электромобилям');
    const value = clean(i.value).split(/\s+или\s+|,\s*/iu)[0];
    return capitalized(`${label}${label ? (/^\d/.test(label) ? ' ' : ' — ') : ''}${value}`);
  });
  const chargingText = item(/электрозаряд/iu)?.value;
  const count = chargingText?.match(/\d+\s+станци[\p{L}]*/iu)?.[0];
  const level = chargingText?.match(/на\s+\d+(?:-[\p{L}]+)?\s+уровне/iu)?.[0];
  const charging = chargingText ? (count && level ? `${count} ${level}` : firstSentence(clean(chargingText))) : '';
  return entrance || tiles.length || free.length || charging ? { entrance, tiles, free, charging } : null;
}

export function loyaltyForVisit(entry: RetailLoyaltyEntry) {
  const facts: { value: string; label: string }[] = [];
  const points = entry.text.match(/(\d+)\s+(балл[\p{L}]*)\s+за\s+([^,.;]*рубль)/iu);
  if (points) facts.push({ value: `${points[1]} ${points[2]}`, label: `за ${points[3].replace(/полный\s+/iu, '')} в чеке` });
  const hours = entry.text.match(/в течение (\d+) часов/iu);
  if (hours) facts.push({ value: `${hours[1]} ${pluralRu(Number(hours[1]), 'час', 'часа', 'часов')}`, label: 'чтобы отсканировать чек' });
  const rewards = clean(entry.text).match(/меняют на ([^.]+)/iu)?.[1];
  if (rewards) facts.push({ value: capitalized(rewards.split(/,\s*/).slice(0, 2).join(', ')), label: 'за баллы' });
  return { name: entry.name, subtitle: /без белорусского номера/iu.test(entry.text) ? 'Можно без белорусского номера' : '', facts, fallback: facts.length ? '' : shortVisitText(entry.text) };
}

const recurring = (entry: RetailEventEntry) => /каждую|по (?:субботам|пятницам|понедельникам|вторникам|средам|четвергам|воскресеньям)|ежегодно|регулярно|кажд\S* сезон|сезонн|ежемесячно|летом/iu.test(entry.date ?? '') || /кажд(?:ый|ую|ое)\s+(?:сезон|недел|месяц|лето|суббот|пятниц)/iu.test(entry.text);

export function eventsForVisit(entries: RetailEventEntry[], year = new Date().getFullYear()) {
  return entries.filter((entry) => {
    const years = [...(entry.date ?? '').matchAll(/(?<!\d)(?:19|20)\d{2}(?!\d)/g)].map((m) => Number(m[0]));
    return recurring(entry) || !years.length || Math.max(...years) >= year;
  }).sort((a, b) => Number(recurring(b)) - Number(recurring(a)));
}

export function eventDateForVisit(entry: RetailEventEntry): string {
  let date = entry.date ?? '';
  if (recurring(entry)) date = date.replace(/(?:с\s+)?(?:19|20)\d{2}(?:\s*[–—-]\s*(?:19|20)\d{2})?(?:\s+и\s+(?:19|20)\d{2})?\s*(?:года|год|г\.)?[,\s]*/gu, '').replace(/^[,\s]+|[,\s]+$/g, '');
  if (!date && /каждый сезон/iu.test(entry.text)) date = 'Каждый сезон';
  return capitalized(shortVisitText(date, 70));
}

export function hasGettingHereInfo(info: RetailInfo): boolean {
  const transport = transportForVisit(info.transport);
  return Boolean(transport.metro.length || transport.routes.length || transport.transfers.length || parkingForVisit(info.parking, info.hours));
}

export function hasOffersEventsInfo(info: RetailInfo): boolean {
  return Boolean(info.loyalty.length || eventsForVisit(info.events).length);
}

// Убираем «Полезно знать» и из общей инфраструктуры ТЦ (владелец, 2026-09-25).
export function isHiddenVisitService(name: string): boolean {
  return /гардероб|курен|курил|инфоцентр|информационн[\p{L}]* (?:центр|стойк)|празднич[\p{L}]* (?:график|режим)/iu.test(name);
}
