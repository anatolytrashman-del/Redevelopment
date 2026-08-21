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

// Подкатегории — только для расходов, привязаны к конкретной категории
// (не общий список на все категории сразу). Список открытый и per-категория,
// как и сами категории — новые подкатегории добавляются прямо из формы
// (см. Transactions.tsx), это только стартовый набор.
export const subcategoriesByCategory: Record<string, readonly string[]> = {
  'Ремонтные работы': ['Электрика'],
};

// Категории для операций дохода — отдельный (растущий) список, как и
// категории расходов выше; список расходных категорий при этом не меняется.
export const incomeCategories = ['Сдача недвижимости в аренду'] as const;

// Двое партнёров, между которыми расходы делятся 50/50, если не
// компенсированы (см. calculateBalances в Transactions.tsx).
export const splitPayers = ['Трэшмен', 'Степа'] as const;
export type SplitPayer = (typeof splitPayers)[number];

// Остальные плательщики — их непогашенные траты не делятся пополам, а
// целиком считаются долгом перед ними (см. calculateSoloDebts в Transactions.tsx).
// Влад Ждонец тоже здесь: он платит за компанию из своих денег, и это нужно
// вернуть — тот же механизм долга, что и у Татьяны Давыдчик. При этом у него
// отдельно бывают и доходные операции (см. incomePayers ниже) — это два
// независимых списка, один человек может встречаться в обоих сразу.
export const soloPayers = ['Татьяна Давыдчик', 'Влад Ждонец'] as const;
export type SoloPayer = (typeof soloPayers)[number];

export const payers = [...splitPayers, ...soloPayers] as const;

// Плательщики для операций дохода (кто нам заплатил) — отдельный список,
// не участвует в делёжке 50/50 (calculateBalances) в Transactions.tsx, чисто
// для отметки источника. calculateSoloDebts (расходы) и этот список
// (доходы) — разные, не связанные друг с другом измерения одного человека.
export const incomePayers = ['Влад Ждонец', 'Рита'] as const;

// Раньше было объединением payers — теперь просто string, потому что
// значение может приходить из payers (расход) или incomePayers (доход),
// а оба списка открытые (пополняются прямо из формы, см. Transactions.tsx).
export type Payer = string;

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
  // Пусто — подкатегория не указана (не для всех категорий она вообще
  // заведена) или транзакция дохода, где подкатегорий нет.
  subcategory: string;
  paidBy: Payer;
  paidFrom: string;
  compensated: boolean;
  // Дата, на которую зафиксирован курс валюты этой транзакции к USD (см.
  // exchangeRatesApi.ts/currencyConvert.ts) — дата СОХРАНЕНИЯ записи, не
  // дата самой транзакции (см. развёрнутый комментарий в Transactions.tsx
  // у места, где эта дата проставляется). Не редактируется из формы.
  rateDate: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/transactionsApi.ts
export interface TransactionRow {
  id: string;
  date: string;
  amount: number;
  currency: Currency;
  purpose: string;
  category: string;
  subcategory: string | null;
  paid_by: string;
  paid_from: string;
  compensated: boolean;
  rate_date: string | null;
}
