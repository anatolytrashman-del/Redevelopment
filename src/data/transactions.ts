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

export const transactions: Transaction[] = [];
