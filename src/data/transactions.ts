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
