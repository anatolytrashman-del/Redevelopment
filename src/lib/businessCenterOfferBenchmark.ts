// Сравнение цены здания со срезом рынка (медианы market_snapshots по
// классу и району) — строка, которая стоит вплотную к самому числу в
// плитке сделки: «$2 000/м²» сам по себе ничего не говорит тому, кто не
// держит в голове медиану по классу.
//
// Отдельным файлом, а не внутри BuildingOffersSection: это текст на
// публичной странице, у него свой тест, а компонентный модуль должен
// экспортировать компоненты.
import { MIN_RELIABLE_N, type MarketSnapshot } from '../data/marketSnapshots';
import { formatRate, type DealType } from './businessCenterOfferStats';

export interface DealBenchmark {
  // Подписи приходят в родительном падеже и БЕЗ слова «медиана» («класса
  // B», «Центрального района») — его подставляет benchmarkLines, потому
  // что падеж у него разный: «+8% к медиане класса B», но «на уровне
  // медианы класса B».
  classLabel: string | null;
  classSnapshot: MarketSnapshot | undefined;
  districtLabel: string | null;
  districtSnapshot: MarketSnapshot | undefined;
}

// Сравнение пишется знаком, а не фразой: «выше на 8% медианы по классу B
// ($1 850/м²)» читается как предложение, которое надо разобрать, а «+8% к
// медиане класса B ($1 850/м²)» — как показатель, который видно сразу.
function compareLabel(diffPct: number): string {
  const rounded = Math.round(diffPct);
  if (Math.abs(rounded) < 5) return 'на уровне';
  return rounded > 0 ? `+${rounded}%` : `−${Math.abs(rounded)}%`;
}

// Сравнение со срезом рынка стоит вплотную к самому числу, а не отдельным
// блоком ниже (как было до 2026-09-21): «$2 000/м²» сам по себе ничего не
// говорит тому, кто не держит в голове медиану по классу.
export function benchmarkLines(median: number, deal: DealType, benchmark: DealBenchmark | null): string[] {
  if (!benchmark) return [];
  const lines: string[] = [];
  const push = (label: string | null, snapshot: MarketSnapshot | undefined) => {
    if (!label || snapshot?.median == null || snapshot.n < MIN_RELIABLE_N) return;
    const diff = ((median - snapshot.median) / snapshot.median) * 100;
    const compared = compareLabel(diff);
    const rate = `${formatRate(snapshot.median, deal)}/м²`;
    lines.push(
      compared === 'на уровне' ? `на уровне медианы ${label} (${rate})` : `${compared} к медиане ${label} (${rate})`,
    );
  };
  push(benchmark.classLabel, benchmark.classSnapshot);
  push(benchmark.districtLabel, benchmark.districtSnapshot);
  return lines;
}
