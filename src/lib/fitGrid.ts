// Сетка карточек под их фактическое число: две карточки в сетке на пять
// колонок занимали треть ширины, а справа зияла пустота (владелец,
// 2026-09-30: «в половине блоков неоптимально используем место»). Колонок
// берём столько, чтобы ряды были заполнены ровно: 4 → 2+2, 6 → 3+3, 7 → 4+3.
export function balancedColumns(count: number, max: number): number {
  if (count <= 1 || max <= 1) return 1;
  const rows = Math.ceil(count / max);
  return Math.ceil(count / rows);
}

// Классы — литералами: Tailwind находит их только целыми строками в исходнике.
const WIDE: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
};

// Мелкие плитки (цифра + подпись) и на телефоне идут по две.
const TILES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 lg:grid-cols-5',
};

export function fitGridClass(count: number, max = 3, kind: 'wide' | 'tiles' = 'wide'): string {
  const columns = Math.min(balancedColumns(count, Math.min(max, 5)), 5);
  return (kind === 'tiles' ? TILES : WIDE)[columns];
}
