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
}

export interface FinCategory {
  id: string;
  title: string;
  kind: 'income' | 'expense';
  entries: FinEntry[];
}

// Лизинг — не ручная статья, а калькулятор: из суммы/аванса/срока/ставки
// генерируется аннуитетный график платежей, который подставляется в расходы.
// Ставка annualRatePct — то самое "сменное" поле: пока реальная ставка
// неизвестна, подставляется любая, вся модель пересчитывается на лету.
export interface FinLeasing {
  contractSum: number | null;
  downPayment: number | null;
  termMonths: number | null;
  annualRatePct: number | null;
  // Месяц первого регулярного платежа (аванс всегда в месяце 1).
  startMonth: number;
  // Платежи по лизингу зачитываются как расходы ИП (ускоренная амортизация,
  // см. консультацию с юристом в Саммери встреч) — по умолчанию да.
  deductible: boolean;
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
}

export interface FinModel {
  id: string;
  objectId: string;
  name: string;
  params: FinParams;
  leasing: FinLeasing;
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
  categories: FinCategory[] | null;
  created_at: string;
}

export function defaultFinParams(): FinParams {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { startDate: ym, horizonMonths: 60, taxRevenuePct: 16, taxProfitPct: 20, revenueLimitByn: 500000 };
}

export function defaultFinLeasing(): FinLeasing {
  return { contractSum: null, downPayment: null, termMonths: 60, annualRatePct: null, startMonth: 1, deductible: true };
}

function entry(label: string, schedule: FinSchedule, deductible = true): FinEntry {
  return { id: crypto.randomUUID(), label, amount: null, schedule, deductible };
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
      title: 'Аренда',
      kind: 'income',
      entries: [entry('Аренда кабинетов', { ...monthly }), entry('Аренда рабочих мест', { ...monthly })],
    },
    {
      id: crypto.randomUUID(),
      title: 'Продажа объектов',
      kind: 'income',
      entries: [entry('Продажа части здания', { ...once })],
    },
    {
      id: crypto.randomUUID(),
      title: 'Ремонт',
      kind: 'expense',
      entries: [
        entry('Ремонт фасада', { ...once }),
        entry('Ремонт интерьера', { ...once }),
        entry('Согласование фасада', { ...once }),
      ],
    },
    {
      id: crypto.randomUUID(),
      title: 'Эксплуатация',
      kind: 'expense',
      entries: [
        entry('Электричество', { ...monthly }),
        entry('Вода и канализация', { ...monthly }),
        entry('Отопление', { ...monthly }),
        entry('Вывоз мусора', { ...monthly }),
        entry('Уборка помещений', { ...monthly }),
        entry('Уборка территории и снега', { ...monthly }),
        entry('Интернет', { ...monthly }),
        entry('Онлайн-сервисы (CRM, ЭДО)', { ...monthly }),
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
      title: 'Управление',
      kind: 'expense',
      entries: [
        entry('Зарплата управляющего', { ...monthly }),
        entry('Бухгалтерия', { ...monthly }),
        entry('Маркетинг и реклама', { ...monthly }),
        entry('Банковские комиссии', { ...monthly }),
      ],
    },
  ];
}
