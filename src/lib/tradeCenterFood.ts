// «Где поесть» в виде меню (вариант Б, владелец, 2026-09-30): сверху
// несколько цифр, ниже заведения по типам одной строкой — название, отточие,
// этаж и часы. Пояснения и ссылки на источники из note на странице не
// показываем: они длинные и ломали строку.
import type { RetailFoodInfo, RetailFoodPlace } from '../data/businessCenters';
import { pluralRu } from './pluralRu';
import type { FoodPlaceGroup } from './tradeCenterRetail';

const TIME = String.raw`(\d{1,2})[:.](\d{2})`;

const hour = (h: string, m: string) => (m === '00' ? String(Number(h)) : `${Number(h)}:${m}`);

/** «Ежедневно 9:00–22:00 (Яндекс Карты…)» → «9–22»; «по будням до 23:00…» → «до 23». */
export function placeHoursShort(note: string | null | undefined): string | null {
  if (!note) return null;
  if (/круглосуточ/iu.test(note)) return '24 часа';
  // Часы бизнес-ланча и обедов — не часы работы: «бизнес-ланч в будни
  // 12:00–16:00, 10:00–23:00» у «Амстердама» даёт 10–23, а не 12–16.
  const range = [...note.matchAll(new RegExp(`${TIME}\\s*[–—-]\\s*${TIME}`, 'g'))]
    .find((m) => !/(?:ланч|обед|завтрак|меню)[^;,]{0,20}$/iu.test(note.slice(0, m.index)));
  if (range) return `${hour(range[1], range[2])}–${hour(range[3], range[4])}`;
  const until = note.match(new RegExp(`до\\s+${TIME}`, 'u'));
  return until ? `до ${hour(until[1], until[2])}` : null;
}

/** Самый поздний час закрытия из часов заведений и зон: «23:00». */
export function latestClosing(food: RetailFoodInfo): string | null {
  const texts = [...food.places.map((p) => p.note ?? ''), ...food.zones.map((z) => z.hours ?? '')];
  let best = -1;
  for (const text of texts) {
    for (const m of text.matchAll(new RegExp(`(?:[–—-]|до)\\s*${TIME}`, 'gu'))) {
      let minutes = Number(m[1]) * 60 + Number(m[2]);
      if (minutes <= 5 * 60) minutes += 24 * 60; // «до 2:00» ночи — позже полуночи
      if (minutes > best) best = minutes;
    }
  }
  if (best < 0) return null;
  const h = Math.floor(best / 60) % 24;
  return `${h}:${String(best % 60).padStart(2, '0')}`;
}

function floorsOf(places: RetailFoodPlace[]): number[] {
  const floors = new Set<number>();
  for (const p of places) for (const m of (p.floor ?? '').matchAll(/-?\d+/g)) floors.add(Number(m[0]));
  return [...floors].sort((a, b) => a - b);
}

const minus = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));

export interface FoodMenuStat {
  value: string;
  label: string;
}

/** До четырёх цифр над меню: сколько мест, сколько на фудкорте, этажи, до скольких открыто. */
export function foodMenuStats(food: RetailFoodInfo): FoodMenuStat[] {
  const stats: FoodMenuStat[] = [];
  const total = food.places.length;
  if (total) stats.push({ value: String(total), label: pluralRu(total, 'заведение', 'заведения', 'заведений') });
  const inFoodcourt = food.places.filter((p) => p.inFoodcourt).length;
  if (inFoodcourt) stats.push({ value: String(inFoodcourt), label: 'на фудкорте' });
  // Места считаем, только когда зона одна: у Galleria 88 мест — это терраса,
  // а не весь фудкорт.
  const seats = food.zones.length === 1 ? Number((food.zones[0].seats ?? '').replace(/\s/g, '')) : 0;
  if (seats > 0 && stats.length < 3) stats.push({ value: seats.toLocaleString('ru-RU'), label: pluralRu(seats, 'посадочное место', 'посадочных места', 'посадочных мест') });
  const floors = floorsOf(food.places);
  if (floors.length === 1) stats.push({ value: minus(floors[0]), label: 'этаж' });
  else if (floors.length > 1) {
    const first = floors[0];
    const last = floors[floors.length - 1];
    // Без «нулевого» этажа: −1 и 1 идут подряд.
    const contiguous = floors.every((f, i) => i === 0 || f - floors[i - 1] === 1 || (floors[i - 1] === -1 && f === 1));
    // Этажи вразброс (у Galleria −1…7 и 21) — просто сколько их.
    if (contiguous) stats.push({ value: `${minus(first)}–${minus(last)}`, label: 'этажи' });
    else if (floors.length <= 3) stats.push({ value: floors.map(minus).join(', '), label: 'этажи' });
    else stats.push({ value: String(floors.length), label: pluralRu(floors.length, 'этаж с едой', 'этажа с едой', 'этажей с едой') });
  }
  const closing = latestClosing(food);
  if (closing) stats.push({ value: `до ${closing}`, label: 'открыто дольше всех' });
  return stats.slice(0, 4);
}

/** Больше скольких строк в группе прячем до «Показать все». */
export const FOOD_MENU_GROUP_LIMIT = 6;

/**
 * Сколько строк каждой группы видно в свёрнутом меню. Маленький список
 * (до 16 заведений) виден целиком; у большого — по шесть строк на тип,
 * а группа, где спрятать пришлось бы одну-две строки, видна вся.
 */
export function foodMenuVisibleCounts(groups: FoodPlaceGroup[]): number[] {
  const total = groups.reduce((sum, g) => sum + g.places.length, 0);
  return groups.map((g) => (total <= 16 || g.places.length <= FOOD_MENU_GROUP_LIMIT + 2 ? g.places.length : FOOD_MENU_GROUP_LIMIT));
}
