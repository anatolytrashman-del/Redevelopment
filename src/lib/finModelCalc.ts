import type { FinAmortization, FinEntry, FinLeasing, FinModel, FinRent, FinSale } from '../data/finModels';

// Чистый расчёт финмодели — без UI и без запросов, на вход FinModel, на
// выход помесячная сетка + годовые сводки + KPI. Вынесен отдельно, чтобы
// страница только рисовала числа, а математику можно было проверять глазами
// в одном месте.

export interface FinMonth {
  index: number; // 1-based номер месяца модели
  year: number; // календарный год (для группировки и лимита 500k)
  label: string; // "янв 2027"
  income: number;
  rentIncome: number; // из них аренда (калькулятор — см. rentInMonth)
  saleIncome: number; // из них продажи объектов (калькулятор — см. FinSale)
  expense: number; // операционные расходы + лизинг, без налога
  leasing: number; // из них лизинг (аванс + платежи) — для отдельной строки
  deductibleExpense: number;
  // Из expense — статьи, отмеченные "переложить на арендаторов". Реально
  // уходят из кассы (остаются в expense), но не режут net — компенсируются
  // арендатором сверх аренды.
  reimbursedExpense: number;
  // Амортизация — НЕ входит в expense (не касса), только в deductibleExpense
  // (снижает налоговую базу). Отдельное поле для отображения в таблице.
  amortization: number;
  // Резерв на капремонт — % от аренды месяца, реальная касса (входит в
  // expense), отдельное поле для отображения.
  capexReserve: number;
  tax: number; // доля годового налога, пропорциональная доходу месяца
  net: number; // income − (expense − reimbursedExpense) − tax
  cumulative: number;
}

export type TaxRegime = 'revenue' | 'profit';

export interface FinYear {
  year: number;
  months: FinMonth[];
  income: number;
  rentIncome: number;
  saleIncome: number;
  expense: number;
  leasing: number;
  reimbursedExpense: number;
  amortization: number;
  capexReserve: number;
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
  totalRentIncome: number;
  totalSaleIncome: number;
  totalExpense: number; // операционные + лизинг, без налога
  totalTax: number;
  netProfit: number;
  // Сумма всех статей "переложить на арендаторов" за весь горизонт — сколько
  // всего сверх аренды ляжет на арендаторов компенсацией расходов.
  totalReimbursedExpense: number;
  // Сумма амортизации за весь горизонт — не касса, только налоговый вычет.
  totalAmortization: number;
  // Сумма резерва на капремонт за весь горизонт — реальная касса.
  totalCapexReserve: number;
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
  // Непогашенный остаток долга, который потребовалось погасить одной суммой
  // в конце срока договора (баллон) — null, если баллона нет.
  leasingBalloonAmount: number | null;
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

// Инфляция расходов — % в год, сложным процентом от старта модели.
// Не применяется к разовым (once) статьям: пользователь уже вводит их по
// ожидаемой цене на нужный месяц, задваивать рост незачем.
function inflatedEntryAmount(e: FinEntry, monthIndex: number, horizon: number, inflationPctPerYear: number): number {
  const base = entryAmountInMonth(e, monthIndex, horizon);
  if (!base || e.schedule.type === 'once' || !inflationPctPerYear) return base;
  const elapsedYears = Math.floor((monthIndex - 1) / 12);
  return base * Math.pow(1 + inflationPctPerYear / 100, elapsedYears);
}

// Аннуитетный платёж на остаток долга и оставшийся срок — общая формула,
// используется и для исходного платежа по лизингу, и для пересчёта после
// досрочного погашения (см. buildLeasingCashFlow). При нулевой ставке —
// просто равные доли.
export function annuityPayment(balance: number, remainingMonths: number, monthlyRate: number): number {
  if (balance <= 0 || remainingMonths <= 0) return 0;
  if (monthlyRate === 0) return balance / remainingMonths;
  return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -remainingMonths));
}

// Аннуитетный платёж по лизингу от финансируемой части (сумма − аванс) —
// в валюте договора, на срок АМОРТИЗАЦИИ (не срок договора — см. FinLeasing).
export function leasingMonthlyPayment(l: FinLeasing): number | null {
  const sum = l.contractSum ?? 0;
  const n = l.amortizationMonths ?? 0;
  if (sum <= 0 || n <= 0) return null;
  const financed = Math.max(0, sum - (l.downPayment ?? 0));
  return annuityPayment(financed, n, (l.annualRatePct ?? 0) / 100 / 12);
}

// Курс пересчёта лизинговых сумм в BYN. Для валютного договора без
// заполненного курса — 0 (лизинг выпадает из расчёта, но об этом явно
// сигналит leasingRateMissing), НЕ 1: молчаливый пересчёт доллара 1:1
// занизил бы расходы втрое и выглядел бы как правдоподобная модель.
export function leasingByn(l: FinLeasing): number {
  return l.currency === 'BYN' ? 1 : (l.exchangeRate ?? 0);
}

// Доход от аренды в конкретном месяце — до реновации по одной цене за м²,
// во время простоя 0, после реновации обновлённая цена за м² плюс рабочие
// места (появляются вместе с обновлённой арендой). renovationStartMonth
// не заполнен — считаем, что реновация ещё не наступит в горизонте модели,
// весь срок по цене "до реновации". Сверху накладываются:
// - ежегодный рост ставки (сложным процентом от старта модели);
// - плавный выход на полную заполняемость после конца простоя (иначе
//   мгновенный скачок с простоя сразу на 100%);
// - вакансия/недосбор — процент, который никогда не собирается.
export function rentInMonth(rent: FinRent, monthIndex: number): number {
  const renoStart = rent.renovationStartMonth;
  let gross: number;
  let occupancyFactor = 1;

  if (renoStart == null || monthIndex < renoStart) {
    gross = (rent.pricePreMeter ?? 0) * (rent.areaPreMeters ?? 0);
  } else {
    const downtime = Math.max(0, Math.floor(rent.renovationMonths ?? 0) || 0);
    if (monthIndex < renoStart + downtime) return 0;
    const cabinets = (rent.pricePostMeter ?? 0) * (rent.areaPostMeters ?? 0);
    const workstations = (rent.workstationPrice ?? 0) * (rent.workstationCount ?? 0);
    gross = cabinets + workstations;

    const stabilization = Math.max(0, Math.floor(rent.stabilizationMonths ?? 0) || 0);
    if (stabilization > 0) {
      const monthsSincePostStart = monthIndex - (renoStart + downtime) + 1;
      occupancyFactor = Math.min(1, monthsSincePostStart / stabilization);
    }
  }

  const growthPct = rent.annualGrowthPct ?? 0;
  if (growthPct) {
    const elapsedYears = Math.floor((monthIndex - 1) / 12);
    gross *= Math.pow(1 + growthPct / 100, elapsedYears);
  }

  const vacancyFactor = 1 - Math.min(1, Math.max(0, (rent.vacancyPct ?? 0) / 100));
  return gross * occupancyFactor * vacancyFactor;
}

// Амортизация — фиксированная сумма в месяц на заданный срок (null —
// бессрочно, до конца горизонта модели). Не касается кассы вообще, только
// налогового вычета — см. calculateFinModel.
export function amortizationInMonth(a: FinAmortization, monthIndex: number): number {
  const amount = a.monthlyAmount ?? 0;
  if (!amount) return 0;
  const start = Math.max(1, a.startMonth || 1);
  if (monthIndex < start) return 0;
  if (a.termMonths != null && monthIndex >= start + a.termMonths) return 0;
  return amount;
}

// "YYYY-MM" (как params.startDate) → номер месяца модели (1-based), может
// быть меньше 1 (дата до старта модели) или больше горизонта — вызывающий
// код сам сверяет с диапазоном.
function monthIndexFromDate(dateStr: string, start: { year: number; month: number }): number | null {
  if (!dateStr) return null;
  const [y, m] = dateStr.split('-').map(Number);
  if (!y || !m) return null;
  return (y - start.year) * 12 + (m - start.month) + 1;
}

// Сумма продажи в BYN: площадь × цена за м² ($) × курс. Курс не заполнен —
// 0 (сделка не считается), тот же принцип, что у leasingByn — не подставлять
// молча 1:1.
export function saleAmountByn(s: FinSale): number {
  return (s.areaMeters ?? 0) * (s.pricePerMeterUsd ?? 0) * (s.exchangeRate ?? 0);
}

// Сумма продажи за вычетом расходов на саму сделку — реальные деньги,
// которые остаются в бизнесе (идут в доход и, если applyToLeasing, на
// погашение лизинга).
export function saleNetByn(s: FinSale): number {
  return Math.max(0, saleAmountByn(s) - (s.transactionCost ?? 0));
}

export interface LeasingCashFlowResult {
  // BYN по месяцам модели (индекс 0 = месяц 1).
  cashFlow: number[];
  // Непогашенный остаток, который потребовалось погасить одной суммой в
  // конце срока договора (баллон) — null, если баллона нет (срок договора
  // не короче срока амортизации, или лизинг не задан).
  balloonAmount: number | null;
}

// Кассовый поток по лизингу (аванс + комиссия за оформление + платежи +
// баллонный платёж), в BYN. Платёж считается на срок АМОРТИЗАЦИИ, но
// реально платится только до срока ДОГОВОРА (termMonths) — если он короче,
// остаток долга на этот момент гасится одной суммой (баллон), лизинг
// закрыт. Обычный аннуитет на весь срок, ЕСЛИ ни одна продажа не помечена
// "на погашение лизинга" и баллона нет — пересчитанный на каждый месяц
// платёж в этом случае совпадает с исходным (тождество аннуитета).
// Продажа с applyToLeasing уменьшает остаток долга в месяце сделки, платёж
// на оставшийся срок пересчитывается заново — срок амортизации не меняется,
// платёж становится меньше.
export function buildLeasingCashFlow(
  leasing: FinLeasing,
  sales: FinSale[],
  start: { year: number; month: number },
  horizon: number,
): LeasingCashFlowResult {
  const cashFlow = new Array(horizon).fill(0);
  const rate = leasingByn(leasing);
  const amortMonths = leasing.amortizationMonths ?? 0;
  const payoffMonths = leasing.termMonths ?? amortMonths;
  const hasBalloon = leasing.termMonths != null && leasing.termMonths > 0 && leasing.termMonths < amortMonths;
  const leasingStart = Math.max(1, leasing.startMonth || 1);
  const financed = Math.max(0, (leasing.contractSum ?? 0) - (leasing.downPayment ?? 0));
  const rMonthly = (leasing.annualRatePct ?? 0) / 100 / 12;

  if (rate > 0) {
    if (leasing.downPayment) cashFlow[0] += leasing.downPayment * rate;
    if (leasing.originationFeePct) {
      cashFlow[0] += (leasing.contractSum ?? 0) * (leasing.originationFeePct / 100) * rate;
    }
  }
  if (financed <= 0 || amortMonths <= 0 || payoffMonths <= 0 || rate <= 0) {
    return { cashFlow, balloonAmount: null };
  }

  const prepayments = sales
    .filter((s) => s.applyToLeasing)
    .map((s) => ({ amountByn: saleNetByn(s), monthIndex: monthIndexFromDate(s.saleDate, start) }))
    .filter((p): p is { amountByn: number; monthIndex: number } => p.amountByn > 0 && p.monthIndex != null);

  let balance = financed;
  let payment = annuityPayment(balance, amortMonths, rMonthly);
  let balloonAmount: number | null = null;
  let closed = false;

  for (let i = 1; i <= horizon; i++) {
    if (!closed && i >= leasingStart && i < leasingStart + payoffMonths && payment > 0) {
      const interest = balance * rMonthly;
      const principal = Math.min(balance, Math.max(0, payment - interest));
      balance = Math.max(0, balance - principal);
      cashFlow[i - 1] += payment * rate;
    }

    if (!closed) {
      for (const p of prepayments) {
        if (p.monthIndex !== i || balance <= 0) continue;
        const applied = Math.min(balance, p.amountByn / rate);
        balance -= applied;
        cashFlow[i - 1] += applied * rate;
      }
    }

    // Последний месяц срока договора при баллоне — остаток гасится одной
    // суммой, лизинг закрыт (дальше ни платежей, ни погашений).
    if (!closed && hasBalloon && i === leasingStart + payoffMonths - 1) {
      if (balance > 0) {
        balloonAmount = balance;
        cashFlow[i - 1] += balance * rate;
        balance = 0;
      }
      closed = true;
    }

    if (!closed) {
      const monthsPaid = Math.max(0, Math.min(amortMonths, i + 1 - leasingStart));
      const remainingMonths = amortMonths - monthsPaid;
      payment = remainingMonths > 0 ? annuityPayment(balance, remainingMonths, rMonthly) : 0;
    }
  }

  return { cashFlow, balloonAmount };
}

export function calculateFinModel(model: FinModel): FinResult {
  const { params, leasing, rent, amortization, capexReserve, sales, categories } = model;
  const horizon = Math.max(1, Math.floor(params.horizonMonths) || 60);
  const start = parseStart(params.startDate);
  const payment = leasingMonthlyPayment(leasing);
  const rate = leasingByn(leasing);
  const leasingRateMissing = payment != null && rate === 0;
  const { cashFlow: leaseCashFlow, balloonAmount: leasingBalloonAmount } = buildLeasingCashFlow(
    leasing,
    sales,
    start,
    horizon,
  );
  const inflationPct = params.expenseInflationPct ?? 0;

  const incomeEntries = categories.filter((c) => c.kind === 'income').flatMap((c) => c.entries);
  const expenseEntries = categories.filter((c) => c.kind === 'expense').flatMap((c) => c.entries);

  // Первый проход: доходы/расходы по месяцам, без налога.
  const months: FinMonth[] = [];
  for (let i = 1; i <= horizon; i++) {
    const absMonth = start.month - 1 + (i - 1); // 0-based от января стартового года
    const year = start.year + Math.floor(absMonth / 12);
    const label = `${MONTH_LABELS[absMonth % 12]} ${year}`;

    const rentIncome = rentInMonth(rent, i);
    const saleIncome = sales.reduce((s, sale) => {
      const idx = monthIndexFromDate(sale.saleDate, start);
      return idx === i ? s + saleNetByn(sale) : s;
    }, 0);
    const income = incomeEntries.reduce((s, e) => s + entryAmountInMonth(e, i, horizon), 0) + rentIncome + saleIncome;
    const opex = expenseEntries.reduce((s, e) => s + inflatedEntryAmount(e, i, horizon, inflationPct), 0);
    const deductibleOpex = expenseEntries.reduce(
      (s, e) => s + (e.deductible ? inflatedEntryAmount(e, i, horizon, inflationPct) : 0),
      0,
    );
    const reimbursedOpex = expenseEntries.reduce(
      (s, e) => s + (e.reimbursable ? inflatedEntryAmount(e, i, horizon, inflationPct) : 0),
      0,
    );
    const lease = leaseCashFlow[i - 1];
    const amort = amortizationInMonth(amortization, i);
    const capexAmt = ((capexReserve.pct ?? 0) / 100) * rentIncome;

    months.push({
      index: i,
      year,
      label,
      income,
      rentIncome,
      saleIncome,
      expense: opex + lease + capexAmt,
      leasing: lease,
      deductibleExpense: deductibleOpex + (leasing.deductible ? lease : 0) + amort + (capexReserve.deductible ? capexAmt : 0),
      reimbursedExpense: reimbursedOpex,
      amortization: amort,
      capexReserve: capexAmt,
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
      rentIncome: inYear.reduce((s, m) => s + m.rentIncome, 0),
      saleIncome: inYear.reduce((s, m) => s + m.saleIncome, 0),
      expense: inYear.reduce((s, m) => s + m.expense, 0),
      leasing: inYear.reduce((s, m) => s + m.leasing, 0),
      reimbursedExpense: inYear.reduce((s, m) => s + m.reimbursedExpense, 0),
      amortization: inYear.reduce((s, m) => s + m.amortization, 0),
      capexReserve: inYear.reduce((s, m) => s + m.capexReserve, 0),
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
  const totalRentIncome = months.reduce((s, m) => s + m.rentIncome, 0);
  const totalSaleIncome = months.reduce((s, m) => s + m.saleIncome, 0);
  const totalExpense = months.reduce((s, m) => s + m.expense, 0);
  const totalTax = months.reduce((s, m) => s + m.tax, 0);
  const totalReimbursedExpense = months.reduce((s, m) => s + m.reimbursedExpense, 0);
  const totalAmortization = months.reduce((s, m) => s + m.amortization, 0);
  const totalCapexReserve = months.reduce((s, m) => s + m.capexReserve, 0);
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
    totalRentIncome,
    totalSaleIncome,
    totalExpense,
    totalTax,
    netProfit: totalIncome - totalExpense + totalReimbursedExpense - totalTax,
    totalReimbursedExpense,
    totalAmortization,
    totalCapexReserve,
    breakEvenMonth,
    maxDrawdown,
    monthlyLeasingPayment: payment,
    leasingRateMissing,
    leasingBalloonAmount,
  };
}
