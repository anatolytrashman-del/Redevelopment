import { badgeColor } from '../lib/badgeColor';

export const currencies = ['RUB', 'USD', 'EUR', 'BYN'] as const;
export type Currency = (typeof currencies)[number];

export const currencySymbols: Record<Currency, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  BYN: 'Br',
};

// Стартовый набор категорий. Список открытый — новые категории можно
// добавлять прямо из формы транзакции (см. Transactions.tsx), поэтому
// тип Category ниже — обычный string, а не фиксированный union.
export const categories = ['Маркетинг', 'IT-инфраструктура', 'Поездки в Минск', 'Консультации'] as const;
export type Category = string;

// Партнёры, между которыми считается баланс "кто кому должен" (см. Transactions.tsx).
// Замените на реальные имена — используются как в форме, так и в расчёте баланса.
export const payers = ['Трэшмен', 'Степа'] as const;
export type Payer = (typeof payers)[number];

// Готовые варианты "Откуда платил". Список открытый, как и категории —
// новые источники добавляются прямо из формы транзакции.
export const sources = ['Т-Банк', 'Альфа'] as const;

export const categoryColor = badgeColor;

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  currency: Currency;
  purpose: string;
  category: Category;
  paidBy: Payer;
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
