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

export const transactions: Transaction[] = [
  {
    id: 't1',
    date: '2026-08-01',
    amount: 85000,
    currency: 'RUB',
    purpose: 'Реклама БЦ «Меркурий» в ЦИАН',
    category: 'Маркетинг',
    paidBy: 'Смирнова Анна',
    paidFrom: 'Корпоративная карта *4821',
    compensated: true,
  },
  {
    id: 't2',
    date: '2026-08-03',
    amount: 240,
    currency: 'USD',
    purpose: 'Продление хостинга и домена платформы',
    category: 'IT-инфраструктура',
    paidBy: 'Ковалёв Дмитрий',
    paidFrom: 'Корпоративная карта *1190',
    compensated: false,
  },
  {
    id: 't3',
    date: '2026-08-05',
    amount: 15000,
    currency: 'RUB',
    purpose: 'Наружная реклама на объекте «Южные ворота»',
    category: 'Маркетинг',
    paidBy: 'Смирнова Анна',
    paidFrom: 'Наличные',
    compensated: false,
  },
  {
    id: 't4',
    date: '2026-08-06',
    amount: 1200,
    currency: 'EUR',
    purpose: 'Лицензии на CRM для отдела продаж',
    category: 'IT-инфраструктура',
    paidBy: 'Ковалёв Дмитрий',
    paidFrom: 'Расчётный счёт компании',
    compensated: true,
  },
  {
    id: 't5',
    date: '2026-08-08',
    amount: 430,
    currency: 'BYN',
    purpose: 'Таргетированная реклама филиала в Минске',
    category: 'Маркетинг',
    paidBy: 'Романюк Ольга',
    paidFrom: 'Корпоративная карта *7742',
    compensated: false,
  },
];
