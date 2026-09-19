// Схлопывание одного и того же физического помещения, выложенного сразу на
// нескольких площадках.
//
// Зачем: объявления по зданию собираются из разных источников (Kufar, Realt),
// а агентства публикуют один лот всюду сразу. Проверка по БЦ «Порт»
// (2026-09-19): офис 259,4 м² на 1 этаже висел одновременно на t-s.by,
// realt.by, kufar.by и megapolis-real.by — четыре записи об одной комнате.
// Пока в базе была только продажа с Kufar и всё с Realt, пересечение было
// небольшим; после починки аренды с Kufar (см. scripts/sync-business-center-
// offers.mjs, сегмент `snyat` в пути) на 1022 строки приходится 174 группы
// с пересечением источников — «5 лотов» на карточке превратилось бы в
// «10 лотов» там, где помещение одно. Логика не завязана на конкретный
// список источников — при добавлении Domovita и Megapolis (2026-09-19,
// см. sync-business-center-offers.mjs) ничего здесь менять не пришлось.
//
// Правило намеренно осторожное: схлопываем только записи из РАЗНЫХ
// источников. Два объявления внутри одного источника — это два объявления,
// даже если площадь и цена совпали: у одного собственника в здании легко
// бывает несколько одинаковых кабинетов (в базе так и есть — четыре
// помещения по 200 м² по одной ставке в «Центрополе»). Лучше показать одним
// лотом меньше, чем нарисовать зданию вдвое больше предложения, чем в нём
// есть.
import type { BusinessCenterOffer } from '../data/businessCenterOffers';

export interface DedupedOffer extends BusinessCenterOffer {
  // Другие площадки, где висит тот же лот (без источника самой записи).
  alsoOn: string[];
}

// Площадь считаем совпавшей с точностью до 0,1 м² — Kufar и Realt берут её
// из одного и того же объявления и не округляют по-разному.
const SIZE_TOLERANCE = 0.05;
// Цена за м² — до 10%: у Kufar она вычисляется из цены в долларах, у Realt
// приходит готовой ставкой, и один лот даёт, например, 13,21 против 13.
const PRICE_TOLERANCE = 0.1;

function samePrice(a: number, b: number): boolean {
  const max = Math.max(a, b);
  if (max <= 0) return a === b;
  return Math.abs(a - b) / max <= PRICE_TOLERANCE;
}

// «Полнее» — та запись, где заполнено больше полей, которые видит человек:
// этаж, внятный тип помещения, адрес. При равенстве побеждает та, что
// пришла раньше в отсортированном списке, чтобы результат не зависел от
// порядка строк из базы.
const VAGUE_TYPES = new Set(['Без категории', 'Не указано', null, '']);
function completeness(offer: BusinessCenterOffer): number {
  let score = 0;
  if (offer.floor != null) score += 1;
  if (!VAGUE_TYPES.has(offer.propertyType)) score += 1;
  if (offer.address) score += 1;
  return score;
}

export function dedupeOffers(offers: BusinessCenterOffer[] | null | undefined): DedupedOffer[] {
  if (!offers || offers.length === 0) return [];
  const sorted = [...offers].sort((a, b) =>
    a.source === b.source ? a.adId.localeCompare(b.adId) : a.source.localeCompare(b.source),
  );

  const clusters: BusinessCenterOffer[][] = [];
  for (const offer of sorted) {
    const cluster = clusters.find(
      (c) =>
        c[0].dealType === offer.dealType &&
        Math.abs(c[0].size - offer.size) <= SIZE_TOLERANCE &&
        samePrice(c[0].pricePerSqm, offer.pricePerSqm) &&
        c.every((o) => o.source !== offer.source),
    );
    if (cluster) cluster.push(offer);
    else clusters.push([offer]);
  }

  return clusters.map((cluster) => {
    const primary = cluster.reduce((best, o) => (completeness(o) > completeness(best) ? o : best));
    const alsoOn = [...new Set(cluster.filter((o) => o !== primary).map((o) => o.source))].sort();
    return { ...primary, alsoOn };
  });
}

// Сколько записей схлопнулось — для честной оговорки под таблицей.
export function duplicateCount(offers: BusinessCenterOffer[] | null | undefined, deduped: DedupedOffer[]): number {
  return Math.max(0, (offers?.length ?? 0) - deduped.length);
}
