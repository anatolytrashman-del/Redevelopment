import type { DistrictPlace } from '../data/districtPlaces';
import { DISTRICT_PLACE_CATEGORIES } from '../data/districtPlaces';
import { QUARTER_HOUSE_INDEX } from '../data/districtQuarters';

// Та же нормализация, что использовалась при построении QUARTER_HOUSE_INDEX
// (см. комментарий в data/districtQuarters.ts) — извлекает "улица|номер дома"
// из полного адреса точки бизнеса. Формат адресов в districtPlaces.ts не
// единый: "ул. Игоря Лученка, 24" (тип улицы первым), "Братская ул., 18,
// этаж 0" (тип улицы вторым + доп. уточнения после второй запятой), у части
// банков — "Минск, просп. Мира, 6" (лишний первый сегмент с названием
// города). normalizeStreet снимает тип улицы и служебные слова независимо
// от их положения, поэтому оба порядка ("ул. X" / "X ул.") дают один ключ.
const STREET_STOPWORDS = ['ул.', 'улица', 'просп.', 'проспект', 'пер.', 'переулок', 'тупик', 'лейтенанта', 'архитектора', 'им.'];

function normalizeStreet(raw: string): string {
  let s = raw.toLowerCase();
  for (const word of STREET_STOPWORDS) {
    s = s.split(word).join(' ');
  }
  s = s.replace(/[«»".]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

export function normalizeStreetHouseKey(address: string): string | null {
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.toLowerCase() !== 'минск');
  if (parts.length < 2) return null;
  const street = normalizeStreet(parts[0]);
  const houseMatch = parts[1].match(/^(\d+[A-Za-zА-Яа-яЁё]?)/);
  if (!street || !houseMatch) return null;
  return `${street}|${houseMatch[1].toUpperCase()}`;
}

export function quarterIdForAddress(address: string): string | null {
  const key = normalizeStreetHouseKey(address);
  if (!key) return null;
  return QUARTER_HOUSE_INDEX[key] ?? null;
}

// place.quarterId (если задан) — явная привязка к кварталу, подтверждённая
// геометрией полигона, а не адресной таблицей застройщика (см. комментарий
// у DistrictPlace.quarterId в data/districtPlaces.ts и у категории
// 'quarter-test-full' там же). Приоритетнее адресного индекса.
function quarterIdForPlace(place: DistrictPlace): string | null {
  return place.quarterId ?? quarterIdForAddress(place.address);
}

// Плотность выбранной категории по кварталам — сколько точек этой категории
// физически находится в каждом квартале. Точки, чей адрес не нашёлся в
// QUARTER_HOUSE_INDEX (дом не из справочника застройщика — см. комментарий в
// districtQuarters.ts) и без явного quarterId, в подсчёт не попадают ни в
// одном квартале, не только в выбранной категории — это ожидаемое
// ограничение справочника, не баг.
export function countsByQuarter(categoryKey: string): Record<string, number> {
  const category = DISTRICT_PLACE_CATEGORIES.find((c) => c.key === categoryKey);
  const counts: Record<string, number> = {};
  if (!category) return counts;
  for (const place of category.places) {
    const quarterId = quarterIdForPlace(place);
    if (!quarterId) continue;
    counts[quarterId] = (counts[quarterId] ?? 0) + 1;
  }
  return counts;
}
