import { DISTRICT_PLACE_CATEGORIES } from '../data/districtPlaces';
import { BUSINESS_BUCKETS, bucketForCategoryKey, bucketForRawCategory } from './businessBuckets';

export interface BucketLocationQuotient {
  bucketId: string;
  label: string;
  localCount: number;
  citywideCount: number;
  lq: number | null; // null — по корзине нет данных ни локально, ни по району
}

// Location quotient — сколько раз доля категории в квартале больше/меньше
// её же доли по всему району в среднем. LQ = 1 — типично, LQ > 1 —
// категория переконцентрирована именно здесь (высокая конкуренция за эту
// нишу), LQ < 1 — недопредставлена (возможная свободная ниша). Метод
// специально нечувствителен к тому, что у категорий разный "нормальный"
// уровень насыщения (владелец: "ПВЗ хватит 1 на пару домов, а кофеен
// может быть несколько даже в одном доме") — сравнение всегда идёт с
// собственной районной базой категории, не с абсолютным числом точек.
//
// citywide (районная база) — считается по DISTRICT_PLACE_CATEGORIES
// целиком (все точки района, а не только привязанные к какому-то кварталу
// — так база устойчивее и не зависит от того, сколько кварталов уже
// размечено полигонами). local (числитель) — по местам с explicit
// quarterId === quarterId, ТОЛЬКО из исчерпывающих поквартирных сборов
// (см. 'quarter-test-full' в data/districtPlaces.ts) — старые фрагментарные
// точки по категориям для того же квартала сознательно не подмешиваются,
// иначе задвоился бы счёт (Wildberries/Belklubnika и так уже входят в
// исчерпывающий список).
export function computeLocationQuotients(quarterId: string): BucketLocationQuotient[] {
  const citywideByBucket: Record<string, number> = {};
  let citywideTotal = 0;
  const localByBucket: Record<string, number> = {};
  let localTotal = 0;

  for (const category of DISTRICT_PLACE_CATEGORIES) {
    if (category.key === 'quarter-test-full') continue; // исчерпывающий тест — не часть районной базы
    const bucketId = bucketForCategoryKey(category.key);
    if (!bucketId) continue; // категория вне корзин (паркинги и т.п.) — не участвует в LQ
    citywideByBucket[bucketId] = (citywideByBucket[bucketId] ?? 0) + category.places.length;
    citywideTotal += category.places.length;
  }

  const testCategory = DISTRICT_PLACE_CATEGORIES.find((c) => c.key === 'quarter-test-full');
  for (const place of testCategory?.places ?? []) {
    if (place.quarterId !== quarterId) continue;
    const bucketId = place.rawCategory ? bucketForRawCategory(place.rawCategory) : null;
    if (!bucketId) continue;
    localByBucket[bucketId] = (localByBucket[bucketId] ?? 0) + 1;
    localTotal += 1;
  }

  return BUSINESS_BUCKETS.map((bucket) => {
    const localCount = localByBucket[bucket.id] ?? 0;
    const citywideCount = citywideByBucket[bucket.id] ?? 0;
    const localShare = localTotal > 0 ? localCount / localTotal : 0;
    const citywideShare = citywideTotal > 0 ? citywideCount / citywideTotal : 0;
    const lq = citywideShare > 0 && localTotal > 0 ? localShare / citywideShare : null;
    return { bucketId: bucket.id, label: bucket.label, localCount, citywideCount, lq };
  }).filter((b) => b.localCount > 0 || b.citywideCount > 0);
}
