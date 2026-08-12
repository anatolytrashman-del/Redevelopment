export const currencies = ['RUB', 'USD', 'EUR', 'BYN'] as const;
export type Currency = (typeof currencies)[number];

export const currencySymbols: Record<Currency, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  BYN: 'Br',
};

// Список категорий пока короткий — добавляйте новые значения сюда по мере необходимости.
export const categories = ['Маркетинг', 'IT-инфраструктура'] as const;
export type Category = (typeof categories)[number];

// Пастельная палитра для бейджей категорий. Цвет подбирается по хэшу названия,
// поэтому новые категории (даже ещё не добавленные в список выше) автоматически
// получают свой стабильный цвет без правки кода.
const categoryPalette: { bg: string; text: string }[] = [
  { bg: '#E3EEFD', text: '#2563A6' }, // синий
  { bg: '#F0E9FB', text: '#6B3FA0' }, // фиолетовый
  { bg: '#E6F6ED', text: '#1AA053' }, // зелёный
  { bg: '#FCEEDD', text: '#B8672A' }, // персиковый
  { bg: '#FCE4EE', text: '#B23B6E' }, // розовый
  { bg: '#DFF5F3', text: '#157A73' }, // бирюзовый
];

export function categoryColor(category: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  }
  return categoryPalette[hash % categoryPalette.length];
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  currency: Currency;
  purpose: string;
  category: Category;
  paidBy: string;
  paidFrom: string;
  compensated: boolean;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/transactionsApi.ts
export interface TransactionRow {
  id: string;
  date: string;
  amount: number;
  currency: Currency;
  purpose: string;
  category: string;
  paid_by: string;
  paid_from: string;
  compensated: boolean;
}
