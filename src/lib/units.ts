// «м²» в смете и «м2»/«кв.м»/«m2» в счёте — одна и та же единица;
// распознавание счёта пишет как в документе, смета — как ввёл человек.
// Общий модуль для сравнения цен (PriceComparisonCard) и формы
// сопоставления счёта (SupplierCorrespondenceTab).
export function normalizeUnit(u: string): string {
  return u
    .trim()
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\s+|\./g, '')
    .replace(/^кв\.?м$|^квм$|^sqm$|^m2$/i, 'м2')
    .replace(/^m3$|^кубм$/i, 'м3')
    .replace(/^шт\.?$|^pcs$|^pc$/i, 'шт');
}

export function sameUnit(a: string, b: string): boolean {
  const na = normalizeUnit(a);
  const nb = normalizeUnit(b);
  return na.length > 0 && na === nb;
}

// Владелец, 2026-09-15: «сопоставляй по объёму, это точнее всего будет» —
// поставщик выставляет в счёте тот же объём, что в ведомости, с поправкой на
// кратность упаковки (992 м² → 991,8 или 992,16). Совпадение в пределах 3%
// считаем тем же объёмом.
export function closeQuantity(a: number | null | undefined, b: number | null | undefined, tolerance = 0.03): boolean {
  if (a == null || b == null || a <= 0 || b <= 0) return false;
  return Math.abs(a - b) / Math.max(a, b) <= tolerance;
}
