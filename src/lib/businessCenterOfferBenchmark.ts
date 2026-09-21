// Одна короткая фраза «дорого или дёшево тут по сравнению с рынком» — под
// ценой в блоке «Что сейчас сдают и продают».
//
// Раньше строк было две (класс и район) и писались они показателями:
// «+25% к медиане класса B ($1 600/м²)». Владелец, 2026-09-21: «прям овер
// сложно воспринимать инфу, нужно упрощать, чтобы поняла домохозяйка» —
// человеку, который просто ищет кабинет, не нужны ни слово «медиана», ни
// доллары за метр в скобках, ни два среза сразу. Осталась одна фраза
// обычными словами, с процентом как единственной цифрой.
//
// Отдельным файлом, а не внутри BuildingOffersSection: это текст на
// публичной странице, у него свой тест, а компонентный модуль должен
// экспортировать компоненты.
import { MIN_RELIABLE_N, type MarketSnapshot } from '../data/marketSnapshots';

export interface DealBenchmark {
  // Подписи приходят готовыми и в том виде, в каком встают во фразу
  // «…чем в среднем по зданиям класса B» / «…чем в среднем по
  // Московскому району».
  classLabel: string | null;
  classSnapshot: MarketSnapshot | undefined;
  districtLabel: string | null;
  districtSnapshot: MarketSnapshot | undefined;
}

// Меньше 5% разницы — это не «дороже», а то же самое: точность исходных
// данных такую разницу не держит.
const SAME_LEVEL_PCT = 5;

/**
 * Берёт срез по классу здания, а если его нет — по району. Два сравнения
 * подряд читатель всё равно не сопоставляет, а место занимают оба.
 */
export function benchmarkLine(price: number, benchmark: DealBenchmark | null): string | null {
  if (!benchmark) return null;

  const pick = (label: string | null, snapshot: MarketSnapshot | undefined) =>
    label && snapshot?.median != null && snapshot.n >= MIN_RELIABLE_N ? { label, median: snapshot.median } : null;

  const chosen = pick(benchmark.classLabel, benchmark.classSnapshot) ?? pick(benchmark.districtLabel, benchmark.districtSnapshot);
  if (!chosen) return null;

  const diff = ((price - chosen.median) / chosen.median) * 100;
  const rounded = Math.round(Math.abs(diff));
  if (rounded < SAME_LEVEL_PCT) return `Столько же, сколько в среднем ${chosen.label}`;
  return `На ${rounded}% ${diff > 0 ? 'дороже' : 'дешевле'}, чем в среднем ${chosen.label}`;
}
