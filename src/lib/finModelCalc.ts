import type { FinEntry, FinLeasing, FinModel } from '../data/finModels';

// Чистый расчёт финмодели — без UI и без запросов, на вход FinModel, на
// выход помесячная сетка + годовые сводки + KPI. Вынесен отдельно, чтобы
// страница только рисовала числа, а математику можно было проверять глазами
// в одном месте.

export interface FinMonth {
  index: number; // 1-based номер месяца модели
  year: number; // календарный год (для группировки и лимита 500k)
  label: string; // "янв 2027"
  income: number;
  expense: number; // операционные расходы + лизинг, без налога
  leasing: number; // из них лизинг (аванс + платежи) — для отдельной строки
  deductibleExpense: number;
  // Из expense — статьи, отмеченные "переложить на арендаторов". Реально
  // уходят из кассы (остаются в expense), но не режут net — компенсируются
  // арендатором сверх аренды.
  reimbursedExpense: number;
  tax: number; // доля годового налога, пропорциональная доходу месяца
  net: number; // income − (expense − reimbursedExpense) − tax
  cumulative: number;
}

export type TaxRegime = 'revenue' | 'profit';

export interface FinYear {
  year: number;
  months: FinMonth[];
  income: number;
  expense: number;
  leasing: number;
  reimbursedExpense: number;
  tax: number;
  taxRegime: TaxRegime;
  taxRevenueVariant: number; // сколько было бы "от оборота"
  taxProfitVariant: number; // сколько было бы "от прибыли"
  net: number;
  cumulativeEnd: number;
  limitExceeded: boolean;
}

export interface FinResult {
  months: FinMonth[];
  years: FinYear[];
  totalIncome: number;
  totalExpense: number; // операционные + лизинг, без налога
  totalTax: number;
  netProfit: number;
  // Сумма всех статей "переложить на арендаторов" за весь горизонт — сколько
  // всего сверх аренды ляжет на арендаторов компенсацией расходов.
  totalReimbursedExpense: number;
  // Первый месяц, в котором накопленный итог вышел в плюс (null — не вышел
  // за горизонт модели).
  breakEvenMonth: FinMonth | null;
  // Самая глубокая просадка накопленного итога (≤0) — сколько всего денег
  // нужно завести в проект до самоокупаемости.
  maxDrawdown: number;
  // В валюте договора лизинга (см. FinLeasing.currency), не в BYN.
  monthlyLeasingPayment: number | null;
  // Валютный лизинг без заполненного курса — платежи не попали в расчёт,
  // UI обязан показать это явно.
  leasingRateMissing: boolean;
}

const MONTH_LABELS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function parseStart(startDate: string): { year: number; month: number } {
  const [y, m] = startDate.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: y, month: m };
}

function entryAmountInMonth(e: FinEntry, monthIndex: number, horizon: number): number {
  const amount = e.amount ?? 0;
  if (!amount) return 0;
  const from = Math.max(1, Math.floor(e.schedule.fromMonth) || 1);
  const to = e.schedule.toMonth ?? horizon;
  switch (e.schedule.type) {
    case 'once':
      return monthIndex === from ? amount : 0;
    case 'monthly':
      return monthIndex >= from && monthIndex <= to ? amount : 0;
    case 'yearly':
      return monthIndex >= from && monthIndex <= to && (monthIndex - from) % 12 === 0 ? amount : 0;
  }
}

// Аннуитетный платёж по лизингу от финансируемой части (сумма − аванс) —
// в валюте договора. При нулевой ставке — просто равные доли.
export function leasingMonthlyPayment(l: FinLeasing): number | null {
  const sum = l.contractSum ?? 0;
  const n = l.termMonths ?? 0;
  if (sum <= 0 || n <= 0) return null;
  const financed = Math.max(0, sum - (l.downPayment ?? 0));
  const r = (l.annualRatePct ?? 0) / 100 / 12;
  if (r === 0) return financed / n;
  return (financed * r) / (1 - Math.pow(1 + r, -n));
}

// Курс пересчёта лизинговых сумм в BYN. Для валютного договора без
// заполненного курса — 0 (лизинг выпадает из расчёта, но об этом явно
// сигналит leasingRateMissing), НЕ 1: молчаливый пересчёт доллара 1:1
// занизил бы расходы втрое и выглядел бы как правдоподобная модель.
export function leasingByn(l: FinLeasing): number {
  return l.currency === 'BYN' ? 1 : (l.exchangeRate ?? 0);
}

function leasingInMonth(l: FinLeasing, monthIndex: number, payment: number | null, rate: number): number {
  let total = 0;
  if (monthIndex === 1) total += l.downPayment ?? 0;
  if (payment != null) {
    const start = Math.max(1, l.startMonth || 1);
    const n = l.termMonths ?? 0;
    if (monthIndex >= start && monthIndex < start + n) total += payment;
  }
  return total * rate;
}

export function calculateFinModel(model: FinModel): FinResult {
  const { params, leasing, categories } = model;
  const horizon = Math.max(1, Math.floor(params.horizonMonths) || 60);
  const start = parseStart(params.startDate);
  const payment = leasingMonthlyPayment(leasing);
  const rate = leasingByn(leasing);
  const leasingRateMissing = payment != null && rate === 0;

  const incomeEntries = categories.filter((c) => c.kind === 'income').flatMap((c) => c.entries);
  const expenseEntries = categories.filter((c) => c.kind === 'expense').flatMap((c) => c.entries);

  // Первый проход: доходы/расходы по месяцам, без налога.
  const months: FinMonth[] = [];
  for (let i = 1; i <= horizon; i++) {
    const absMonth = start.month - 1 + (i - 1); // 0-based от января стартового года
    const year = start.year + Math.floor(absMonth / 12);
    const label = `${MONTH_LABELS[absMonth % 12]} ${year}`;

    const income = incomeEntries.reduce((s, e) => s + entryAmountInMonth(e, i, horizon), 0);
    const opex = expenseEntries.reduce((s, e) => s + entryAmountInMonth(e, i, horizon), 0);
    const deductibleOpex = expenseEntries.reduce(
      (s, e) => s + (e.deductible ? entryAmountInMonth(e, i, horizon) : 0),
      0,
    );
    const reimbursedOpex = expenseEntries.reduce(
      (s, e) => s + (e.reimbursable ? entryAmountInMonth(e, i, horizon) : 0),
      0,
    );
    const lease = leasingInMonth(leasing, i, payment, rate);

    months.push({
      index: i,
      year,
      label,
      income,
      expense: opex + lease,
      leasing: lease,
      deductibleExpense: deductibleOpex + (leasing.deductible ? lease : 0),
      reimbursedExpense: reimbursedOpex,
      tax: 0,
      net: 0,
      cumulative: 0,
    });
  }

  // Второй проход: налог по календарным годам. Режим (от оборота / от
  // прибыли) выбирается на каждый год отдельно — какой дешевле, ровно как
  // это делает бухгалтер по итогам года. Годовой налог раскидывается по
  // месяцам пропорционально доходу месяца, чтобы кривая накопленного итога
  // не прыгала одним куском в декабре.
  const years: FinYear[] = [];
  const yearNumbers = [...new Set(months.map((m) => m.year))];
  for (const year of yearNumbers) {
    const inYear = months.filter((m) => m.year === year);
    const income = inYear.reduce((s, m) => s + m.income, 0);
    const deductible = inYear.reduce((s, m) => s + m.deductibleExpense, 0);
    const taxRevenueVariant = income * (params.taxRevenuePct / 100);
    const taxProfitVariant = Math.max(0, income - deductible) * (params.taxProfitPct / 100);
    const taxRegime: TaxRegime = taxProfitVariant < taxRevenueVariant ? 'profit' : 'revenue';
    const tax = Math.min(taxRevenueVariant, taxProfitVariant);

    for (const m of inYear) {
      m.tax = income > 0 ? tax * (m.income / income) : 0;
    }

    years.push({
      year,
      months: inYear,
      income,
      expense: inYear.reduce((s, m) => s + m.expense, 0),
      leasing: inYear.reduce((s, m) => s + m.leasing, 0),
      reimbursedExpense: inYear.reduce((s, m) => s + m.reimbursedExpense, 0),
      tax,
      taxRegime,
      taxRevenueVariant,
      taxProfitVariant,
      net: 0,
      cumulativeEnd: 0,
      limitExceeded: income > params.revenueLimitByn,
    });
  }

  // Третий проход: чистый поток и накопленный итог.
  let cumulative = 0;
  for (const m of months) {
    m.net = m.income - (m.expense - m.reimbursedExpense) - m.tax;
    cumulative += m.net;
    m.cumulative = cumulative;
  }
  for (const y of years) {
    y.net = y.months.reduce((s, m) => s + m.net, 0);
    y.cumulativeEnd = y.months[y.months.length - 1].cumulative;
  }

  const totalIncome = months.reduce((s, m) => s + m.income, 0);
  const totalExpense = months.reduce((s, m) => s + m.expense, 0);
  const totalTax = months.reduce((s, m) => s + m.tax, 0);
  const totalReimbursedExpense = months.reduce((s, m) => s + m.reimbursedExpense, 0);
  // Точка выхода в плюс — только после того, как проект успел побывать в
  // минусе: без этого условия месяц 1 с нулевыми данными считался бы
  // "выходом в плюс" у совсем пустой модели.
  let wasNegative = false;
  let breakEvenMonth: FinMonth | null = null;
  for (const m of months) {
    if (m.cumulative < 0) wasNegative = true;
    if (wasNegative && m.cumulative >= 0) {
      breakEvenMonth = m;
      break;
    }
  }
  const maxDrawdown = Math.min(0, ...months.map((m) => m.cumulative));

  return {
    months,
    years,
    totalIncome,
    totalExpense,
    totalTax,
    netProfit: totalIncome - totalExpense + totalReimbursedExpense - totalTax,
    totalReimbursedExpense,
    breakEvenMonth,
    maxDrawdown,
    monthlyLeasingPayment: payment,
    leasingRateMissing,
  };
}
