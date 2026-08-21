// Финмодель проекта — привязана к объекту (RealtyObject), как смета, живёт
// вкладкой "Финмодели". Помесячная сетка на горизонт (по умолчанию 5 лет):
// каждая статья дохода/расхода — сумма + расписание, из которых считается
// поток по месяцам, налоги, точка выхода в плюс (см. lib/finModelCalc.ts).
// Валюта — BYN: налоги ИП и лимит выручки 500 000 считаются именно в
// белорусских рублях, второй валюты в модели намеренно нет.

// Расписание статьи. from/to — номера месяцев модели (1-based от даты
// старта). toMonth = null — до конца горизонта.
// - monthly: каждый месяц с from по to
// - once: разово в месяце from (to игнорируется)
// - yearly: в месяце from и дальше каждые 12 месяцев до to
export interface FinSchedule {
  type: 'monthly' | 'once' | 'yearly';
  fromMonth: number;
  toMonth: number | null;
}

export interface FinEntry {
  id: string;
  label: string;
  // null — сумма ещё не известна (заготовка), считается как 0.
  amount: number | null;
  schedule: FinSchedule;
  // Для расходов: зачитывается ли как расход ИП — уменьшает налоговую базу
  // в режиме "20% от (доходы − расходы)". У доходов игнорируется.
  deductible: boolean;
  // Для расходов: перекладывается ли эта статья на арендаторов (компенсация
  // коммунальных/сервисных расходов сверх аренды). Такая статья остаётся
  // видна в расходах как есть (деньги реально уходят из кассы), но не режет
  // чистую прибыль — см. finModelCalc.ts. У доходов игнорируется.
  reimbursable: boolean;
  // Сумма включает НДС по ставке vatPct — в кассе (то, что видно в таблице)
  // остаётся полная сумма как введена, а в налоговую базу ИП (доход "от
  // оборота", вычитаемый расход "от прибыли") идёт сумма без НДС — это
  // транзит в бюджет, не доход/расход ИП. Заведено на будущее сравнение
  // сценариев "с НДС" / "без НДС" — включается по одной статье за раз.
  vatIncluded: boolean;
  vatPct: number | null;
}

export interface FinCategory {
  id: string;
  title: string;
  kind: 'income' | 'expense';
  entries: FinEntry[];
}

export type LeasingCurrency = 'USD' | 'EUR' | 'BYN';

export const LEASING_CURRENCY_SYMBOLS: Record<LeasingCurrency, string> = {
  USD: '$',
  EUR: '€',
  BYN: 'Br',
};

// Лизинг — не ручная статья, а калькулятор: из суммы/аванса/срока/ставки
// генерируется аннуитетный график платежей, который подставляется в расходы.
// Ставка annualRatePct — то самое "сменное" поле: пока реальная ставка
// неизвестна, подставляется любая, вся модель пересчитывается на лету.
//
// Договор лизинга — валютный (обычно USD), остальная модель — BYN, поэтому
// сумма/аванс/платёж живут в валюте договора, а в общий расчёт уходят через
// exchangeRate (BYN за 1 единицу валюты). Курс — второе "сменное" поле:
// прогнозировать его нельзя, но в сценариях-копиях можно стресс-тестить.
// Пока курс не заполнен (и валюта не BYN), лизинг в расчёт не попадает —
// UI показывает это явно, а не подставляет молча 1:1.
export interface FinLeasing {
  contractSum: number | null;
  downPayment: number | null;
  // Срок, на который считается размер платежа (аннуитет от него) — он же
  // "срок погашения" в интерфейсе (сознательно не "срок амортизации" —
  // с тем же словом у ИП есть отдельное налоговое понятие, см.
  // FinAmortization ниже, и путаница этих двух смыслов уже была реальной
  // причиной непонятных цифр).
  amortizationMonths: number | null;
  // Срок самого договора — когда реально нужно всё погасить/рефинансировать.
  // null — совпадает со сроком амортизации (обычный лизинг без баллона).
  // Если меньше amortizationMonths — баллонный платёж: остаток долга на
  // этот момент гасится одной суммой (см. buildLeasingCashFlow).
  termMonths: number | null;
  // Комбинированная ставка по годам кредита/лизинга (считая от startMonth,
  // не от календарного года) — так часто реально предлагают банки: ниже в
  // первый год, потом дороже. year2/fromYear3 не заполнены — берётся ставка
  // предыдущего яруса (см. rateForLoanMonth в finModelCalc.ts), то есть один
  // заполненный ratePctYear1 равносилен старой единой ставке на весь срок.
  ratePctYear1: number | null;
  ratePctYear2: number | null;
  ratePctFromYear3: number | null;
  // Срок в начале графика, когда платится только процент, тело долга не
  // гасится (частое условие у банков на период стройки/выхода на доход).
  // Считается ВНУТРИ amortizationMonths, не сверх него — после этого срока
  // остаток гасится аннуитетом на оставшуюся часть срока погашения, платёж
  // соответственно становится больше, чем был бы без льготного периода.
  interestOnlyMonths: number | null;
  currency: LeasingCurrency;
  exchangeRate: number | null;
  // Месяц первого регулярного платежа (аванс всегда в месяце 1).
  startMonth: number;
  // Разовая комиссия за оформление, % от суммы договора — в месяце 1,
  // вместе с авансом.
  originationFeePct: number | null;
  // Платежи по лизингу зачитываются как расходы ИП (ускоренная амортизация,
  // см. консультацию с юристом в Саммери встреч) — по умолчанию да.
  deductible: boolean;
}

// Аренда — не ручные статьи, а калькулятор (та же идея, что у лизинга):
// до реновации площадь сдаётся по одной цене за м², во время реновации
// простой (доход 0, месяцы не сдаются), после реновации — обновлённая цена
// за м² под кабинеты плюс отдельно рабочие места (обычно новый формат,
// появляется вместе с обновлённой арендой). renovationStartMonth = null —
// реновация не запланирована/дата не указана, вся модель считается по
// цене "до реновации" (см. "числовые ловушки" в CLAUDE.md — null, не 0).
export interface FinRent {
  areaPreMeters: number | null;
  pricePreMeter: number | null;
  // Месяц модели (1-based), с которого начинается простой на реновацию.
  renovationStartMonth: number | null;
  // Длительность простоя, мес. (доход 0 весь этот период).
  renovationMonths: number | null;
  areaPostMeters: number | null;
  pricePostMeter: number | null;
  workstationCount: number | null;
  workstationPrice: number | null;
  // Вакансия/недосбор — % от потенциальной аренды, который никогда не
  // собирается (простой между арендаторами и т.п.). Применяется поверх
  // простоя на реновацию (тот — 0 всегда, вакансия — процент от остального).
  vacancyPct: number | null;
  // Ежегодный рост арендной ставки, % (сложным процентом от даты старта
  // модели) — реальная аренда не стоит на месте 5 лет.
  annualGrowthPct: number | null;
  // Плавный выход на полную заполняемость после конца простоя, мес. — линейный
  // рост занятости от 0 до 100% вместо мгновенного скачка. null/0 — скачком.
  stabilizationMonths: number | null;
  // Ставка аренды с НДС — см. FinEntry.vatIncluded, тот же принцип: в кассе
  // полная сумма, в налоговую базу — без НДС.
  vatIncluded: boolean;
  vatPct: number | null;
}

// Амортизация — отдельный неденежный расход, не статья категорий: сумма в
// месяц уменьшает налоговую базу (как "расход ИП" в режиме "от прибыли"),
// но НЕ списывается с расчётного счёта — в отличие от остальных расходов,
// не входит в кассовый поток вообще, только в налоговый вычет.
//
// 2026-08-21: сам механизм (что именно и как амортизировать ИП) под
// вопросом до уточнения с Татьяной Гаврис (налоговый консультант) — карточка
// временно не в интерфейсе (см. FinModelDetail.tsx), а вклад в расчёт
// принудительно занулён (см. calculateFinModel в finModelCalc.ts), чтобы
// неподтверждённая цифра не искажала видимые сейчас платежи по кредиту/
// лизингу. Ранее введённые значения не удалены — просто временно не
// учитываются, восстановить эффект — вернуть код на месте.
export interface FinAmortization {
  monthlyAmount: number | null;
  startMonth: number;
  // null — до конца горизонта модели.
  termMonths: number | null;
}

// Продажа объектов — не ручные статьи, а список сделок (в отличие от
// аренды/лизинга — их может быть несколько). Площадь и цена за м² — цена в
// $ (реальный рынок так и котируется), пересчёт в BYN через exchangeRate
// у каждой продажи отдельно (курс на разные даты продажи может отличаться).
// saleDate — как params.startDate (YYYY-MM), переводится в номер месяца
// модели при расчёте; '' — дата не указана, сделка не считается.
// applyToLeasing — вся сумма продажи (в BYN) в месяце сделки уходит на
// частичное досрочное погашение остатка долга по лизингу: срок лизинга не
// меняется, платёж на оставшийся срок пересчитывается и становится меньше
// (см. buildLeasingCashFlow в finModelCalc.ts).
export interface FinSale {
  id: string;
  label: string;
  saleDate: string;
  areaMeters: number | null;
  pricePerMeterUsd: number | null;
  exchangeRate: number | null;
  applyToLeasing: boolean;
  // Расходы на саму сделку (риелтор, оформление, налоги при продаже) —
  // разовая сумма в BYN, не процент: у крупной продажи здания и мелкой
  // продажи юнита это совершенно разные по характеру издержки, процент от
  // цены их не отражает. Вычитается из суммы продажи (см. saleNetByn).
  transactionCost: number | null;
}

export interface FinParams {
  // Месяц 1 модели, формат YYYY-MM.
  startDate: string;
  horizonMonths: number;
  // Режим "от оборота": подоходный 20% с вычетом 10% = фактические 16%.
  taxRevenuePct: number;
  // Режим "от прибыли": 20% от (доходы − зачитываемые расходы).
  taxProfitPct: number;
  // Годовой лимит выручки ИП — при превышении подсветка "переход в юрлицо".
  revenueLimitByn: number;
  // Общая инфляция, % в год — применяется к регулярным (monthly/yearly)
  // статьям расходов из категорий (не к разовым once — считаем, что их
  // сумму пользователь уже вводит по ожидаемой цене на нужный месяц; не к
  // лизингу/амортизации/резерву — у них своя динамика).
  expenseInflationPct: number | null;
}

// Резерв на капремонт — не ручная статья, а % от арендного дохода месяца,
// откладываемый автоматически (капремонт кровли, инженерии и т.п. — расход
// не постатейный, а плановое резервирование). Реальные деньги — входит в
// expense, в отличие от амортизации.
export interface FinCapexReserve {
  pct: number | null;
  deductible: boolean;
}

export interface FinModel {
  id: string;
  objectId: string;
  name: string;
  params: FinParams;
  leasing: FinLeasing;
  rent: FinRent;
  amortization: FinAmortization;
  capexReserve: FinCapexReserve;
  sales: FinSale[];
  categories: FinCategory[];
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/finModelsApi.ts
export interface FinModelRow {
  id: string;
  object_id: string;
  name: string;
  params: FinParams | null;
  leasing: FinLeasing | null;
  rent: FinRent | null;
  amortization: FinAmortization | null;
  capex_reserve: FinCapexReserve | null;
  sales: FinSale[] | null;
  categories: FinCategory[] | null;
  created_at: string;
}

export function defaultFinParams(): FinParams {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    startDate: ym,
    horizonMonths: 60,
    taxRevenuePct: 16,
    taxProfitPct: 20,
    revenueLimitByn: 500000,
    expenseInflationPct: null,
  };
}

export function defaultFinLeasing(): FinLeasing {
  return {
    contractSum: null,
    downPayment: null,
    amortizationMonths: 60,
    termMonths: null,
    ratePctYear1: null,
    ratePctYear2: null,
    ratePctFromYear3: null,
    interestOnlyMonths: null,
    currency: 'USD',
    exchangeRate: null,
    startMonth: 1,
    originationFeePct: null,
    deductible: true,
  };
}

export function defaultFinRent(): FinRent {
  return {
    areaPreMeters: null,
    pricePreMeter: null,
    renovationStartMonth: null,
    renovationMonths: 3,
    areaPostMeters: null,
    pricePostMeter: null,
    workstationCount: null,
    workstationPrice: null,
    vacancyPct: null,
    annualGrowthPct: null,
    stabilizationMonths: null,
    vatIncluded: false,
    vatPct: null,
  };
}

export function defaultFinAmortization(): FinAmortization {
  return { monthlyAmount: null, startMonth: 1, termMonths: null };
}

export function defaultFinCapexReserve(): FinCapexReserve {
  return { pct: null, deductible: true };
}

export function defaultFinSales(): FinSale[] {
  return [
    {
      id: crypto.randomUUID(),
      label: 'Продажа части здания',
      saleDate: '',
      areaMeters: null,
      pricePerMeterUsd: null,
      exchangeRate: null,
      applyToLeasing: false,
      transactionCost: null,
    },
  ];
}

function entry(label: string, schedule: FinSchedule, deductible = true): FinEntry {
  return { id: crypto.randomUUID(), label, amount: null, schedule, deductible, reimbursable: false, vatIncluded: false, vatPct: null };
}

const monthly: FinSchedule = { type: 'monthly', fromMonth: 1, toMonth: null };
const once: FinSchedule = { type: 'once', fromMonth: 1, toMonth: null };

// Стартовый набор категорий и статей-заготовок (суммы пустые) — чтобы не
// вспоминать с нуля, что бывает у отдельно стоящего здания. Налог на
// недвижимость намеренно не в списке: по НК его платит арендатор (см.
// консультацию). Всё редактируется/удаляется из интерфейса.
export function defaultFinCategories(): FinCategory[] {
  return [
    {
      id: crypto.randomUUID(),
      title: 'Ремонт',
      kind: 'expense',
      entries: [
        // Платим равными частями за 3 месяца реновации — сумма статьи это
        // размер месячного платежа, не общая стоимость (как везде в модели
        // у monthly-статей, не автоделится). При другом сроке реновации
        // поменять "по мес." под фактический renovationMonths в Аренде.
        entry('Ремонт фасада', { type: 'monthly', fromMonth: 1, toMonth: 3 }),
        entry('Ремонт интерьера', { type: 'monthly', fromMonth: 1, toMonth: 3 }),
        // Разрешения и согласования — разовым платежом в первый месяц
        // модернизации (см. "Месяц начала простоя" в Аренде).
        entry('Разрешения и согласования', { ...once }),
      ],
    },
    {
      id: crypto.randomUUID(),
      title: 'Эксплуатация здания',
      kind: 'expense',
      entries: [
        entry('Электричество', { ...monthly }),
        entry('Вода и канализация', { ...monthly }),
        entry('Отопление', { ...monthly }),
        entry('Вывоз мусора', { ...monthly }),
        entry('Уборка помещений', { ...monthly }),
        entry('Уборка территории и снега', { ...monthly }),
        entry('Пожарная сигнализация (обслуживание)', { ...monthly }),
        entry('Тревожная кнопка / охрана', { ...monthly }),
        entry('Видеонаблюдение', { ...monthly }),
        entry('Обслуживание умных замков', { ...monthly }),
        entry('Страхование здания', { type: 'yearly', fromMonth: 1, toMonth: null }),
        entry('Земельный налог', { type: 'yearly', fromMonth: 1, toMonth: null }),
        entry('Текущий мелкий ремонт', { ...monthly }),
      ],
    },
    {
      id: crypto.randomUUID(),
      title: 'Операционная деятельность',
      kind: 'expense',
      entries: [
        entry('Интернет', { ...monthly }),
        entry('Телефония', { ...monthly }),
        entry('Онлайн-сервисы (CRM, ЭДО)', { ...monthly }),
        entry('Онлайн-банкинг', { ...monthly }),
        entry('Банковские комиссии', { ...monthly }),
        entry('Маркетинг и реклама', { ...monthly }),
      ],
    },
    {
      id: crypto.randomUUID(),
      title: 'Оплата команды',
      kind: 'expense',
      entries: [
        entry('Зарплата управляющего', { ...monthly }),
        entry('Бухгалтерия', { ...monthly }),
        entry('Юридическое и налоговое сопровождение', { ...monthly }),
      ],
    },
  ];
}
