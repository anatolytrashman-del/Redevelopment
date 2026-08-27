import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2, Pencil, FileBarChart, MessageSquare } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { AddableSelect } from '../components/ui/AddableSelect';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { Modal } from '../components/ui/Modal';
import { TransactionCommentsModal } from '../components/transactions/TransactionCommentsModal';
import {
  currencies,
  currencySymbols,
  categories,
  incomeCategories,
  subcategoriesByCategory,
  categoryColor,
  sources,
  type Transaction,
  type Currency,
  type Category,
} from '../data/transactions';
import type { Person } from '../data/people';
import type { TransactionComment } from '../data/transactionComments';
import { fetchTransactions, insertTransaction, updateTransaction } from '../lib/transactionsApi';
import { fetchTodayRate } from '../lib/exchangeRatesApi';
import { fetchPeople } from '../lib/peopleApi';
import { fetchTransactionComments } from '../lib/transactionCommentsApi';

// Ошибки Supabase (PostgrestError) — обычные объекты с полем message,
// а не экземпляры Error, поэтому `instanceof Error` их не ловит.
function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDate(iso: string) {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

function formatAmount(amount: number, currency: Currency) {
  const formatted = amount.toLocaleString('ru-RU');
  const symbol = currencySymbols[currency];
  return currency === 'USD' ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

function formatTotalsMap(map: Map<Currency, number>) {
  if (map.size === 0) return formatAmount(0, 'RUB');
  return [...map.entries()].map(([currency, amount]) => formatAmount(amount, currency)).join(' · ');
}

type OperationKind = 'Расход' | 'Доход';

const emptyForm = {
  kind: 'Расход' as OperationKind,
  date: '',
  amount: '',
  currency: 'RUB' as Currency,
  purpose: '',
  category: 'Маркетинг' as Category,
  subcategory: '',
  paidBy: '',
  paidFrom: '',
  compensated: 'Нет',
};

// Баланс считается только по невзаимозачтённым тратам ("В расчете" = Нет),
// отдельно по каждой валюте, поровну между двумя партнёрами из splitPayers.
// Знак суммы на направление долга не влияет — минус тоже означает
// "потратил столько-то", просто так завели транзакцию. splitPayers
// приходит параметром (строится в компоненте из fetchPeople(), см. Transactions
// ниже) — ожидается ровно 2 человека, как и раньше при захардкоженном списке.
function calculateBalances(transactions: Transaction[], splitPayers: string[]) {
  const byCurrency = new Map<Currency, Map<string, number>>();
  for (const t of transactions) {
    if (t.compensated) continue;
    if (!splitPayers.includes(t.paidBy)) continue;
    if (!byCurrency.has(t.currency)) byCurrency.set(t.currency, new Map());
    const totals = byCurrency.get(t.currency)!;
    totals.set(t.paidBy, (totals.get(t.paidBy) ?? 0) + Math.abs(t.amount));
  }

  const [p1, p2] = splitPayers;
  if (!p1 || !p2) return [];
  return [...byCurrency.entries()].map(([currency, totals]) => {
    const t1 = totals.get(p1) ?? 0;
    const t2 = totals.get(p2) ?? 0;
    const diff = t1 - t2;
    const owed = Math.round((Math.abs(diff) / 2) * 100) / 100;
    return {
      currency,
      totals: { [p1]: t1, [p2]: t2 } as Record<string, number>,
      debtor: diff > 0 ? p2 : p1,
      creditor: diff > 0 ? p1 : p2,
      owed,
    };
  });
}

// Непогашенные траты плательщиков вне пары (например, Татьяна Давыдчик,
// Влад Ждонец) — в отличие от calculateBalances здесь ничего не делится
// пополам, вся сумма просто числится долгом перед ними. Только расходы
// (amount < 0): у Влада Ждонца отдельно бывают ещё и доходные операции
// (isIncomePayer) — те тут ни при чём, это разные, не связанные долги.
function calculateSoloDebts(transactions: Transaction[], soloPayers: string[]) {
  const result: { payer: string; currency: Currency; amount: number }[] = [];
  for (const payer of soloPayers) {
    const byCurrency = new Map<Currency, number>();
    for (const t of transactions) {
      if (t.compensated || t.paidBy !== payer || t.amount >= 0) continue;
      byCurrency.set(t.currency, (byCurrency.get(t.currency) ?? 0) + Math.abs(t.amount));
    }
    for (const [currency, amount] of byCurrency) {
      if (amount > 0) result.push({ payer, currency, amount });
    }
  }
  return result;
}

// Расходы (отрицательная сумма) и доходы (положительная) за текущий календарный
// месяц, отдельно по каждой валюте. Компенсация тут ни при чём — это просто
// движение денег за месяц, а не про то, что ещё не взаимозачтено.
function calculateMonthTotals(transactions: Transaction[]) {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const expenses = new Map<Currency, number>();
  const income = new Map<Currency, number>();

  for (const t of transactions) {
    if (!t.date.startsWith(monthPrefix)) continue;
    if (t.amount < 0) {
      expenses.set(t.currency, (expenses.get(t.currency) ?? 0) + Math.abs(t.amount));
    } else if (t.amount > 0) {
      income.set(t.currency, (income.get(t.currency) ?? 0) + t.amount);
    }
  }

  return { expenses, income };
}

function transactionToForm(t: Transaction) {
  return {
    kind: (t.amount < 0 ? 'Расход' : 'Доход') as OperationKind,
    date: t.date,
    amount: String(Math.abs(t.amount)),
    currency: t.currency,
    purpose: t.purpose,
    category: t.category,
    subcategory: t.subcategory,
    paidBy: t.paidBy,
    paidFrom: t.paidFrom,
    compensated: t.compensated ? 'Да' : 'Нет',
  };
}

export function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Только чтобы при сохранении правки достать исходный rateDate — курс не
  // редактируется из формы (не показываем его пользователю вовсе), но и
  // не должен молча съезжать на другую дату при каждом редактировании
  // транзакции (см. handleSubmit).
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  // Кто платит/получает деньги — из общей таблицы people (data/people.ts),
  // не из захардкоженных списков (см. комментарий у Payer в data/transactions.ts).
  const [people, setPeople] = useState<Person[]>([]);

  // Комментарии ко всем транзакциям разом (см. комментарий у
  // fetchTransactionComments) — группировка по transactionId на клиенте,
  // модалка открывается по клику на строку.
  const [comments, setComments] = useState<TransactionComment[]>([]);
  const [commentsTransaction, setCommentsTransaction] = useState<Transaction | null>(null);
  const commentsByTransaction = useMemo(() => {
    const map = new Map<string, TransactionComment[]>();
    comments.forEach((c) => {
      const list = map.get(c.transactionId) ?? [];
      list.push(c);
      map.set(c.transactionId, list);
    });
    return map;
  }, [comments]);
  const splitPayers = useMemo(() => people.filter((p) => p.isSplitPayer).map((p) => p.name), [people]);
  const soloPayers = useMemo(() => people.filter((p) => p.isSoloPayer).map((p) => p.name), [people]);
  const incomePayers = useMemo(() => people.filter((p) => p.isIncomePayer).map((p) => p.name), [people]);
  const payers = useMemo(() => [...splitPayers, ...soloPayers], [splitPayers, soloPayers]);

  // Списки категорий и источников открытые: стартовый набор + всё, что уже
  // встречалось в загруженных транзакциях (в т.ч. добавленное через форму ранее).
  // Категории расхода и дохода — разные наборы (знак amount определяет,
  // в какой из них попадает уже сохранённая транзакция).
  const knownExpenseCategories = useMemo(() => {
    const set = new Set<string>(categories);
    transactions.forEach((t) => {
      if (t.amount < 0) set.add(t.category);
    });
    return [...set];
  }, [transactions]);

  const knownIncomeCategories = useMemo(() => {
    const set = new Set<string>(incomeCategories);
    transactions.forEach((t) => {
      if (t.amount > 0) set.add(t.category);
    });
    return [...set];
  }, [transactions]);

  const knownSources = useMemo(() => {
    const set = new Set<string>(sources);
    transactions.forEach((t) => set.add(t.paidFrom));
    return [...set];
  }, [transactions]);

  // "Кто платил" — тоже открытый список, тем же принципом, что категории/
  // источники выше: стартовый набор (payers/incomePayers из people) + все
  // значения, уже встречавшиеся в транзакциях. Человек, добавленный так
  // через форму (а не через флаги в таблице people), не попадает в раздел
  // "Непогашенный остаток" — calculateBalances/calculateSoloDebts завязаны
  // на people-списки, а не на все значения paidBy.
  const knownPayers = useMemo(() => {
    const set = new Set<string>(payers);
    transactions.forEach((t) => {
      if (t.amount < 0) set.add(t.paidBy);
    });
    return [...set];
  }, [transactions, payers]);

  const knownIncomePayers = useMemo(() => {
    const set = new Set<string>(incomePayers);
    transactions.forEach((t) => {
      if (t.amount > 0) set.add(t.paidBy);
    });
    return [...set];
  }, [transactions, incomePayers]);

  // Подкатегории — свои для каждой категории (не общий список): стартовый
  // набор из subcategoriesByCategory для выбранной категории + всё, что уже
  // встречалось в расходах именно этой категории.
  const knownSubcategories = useMemo(() => {
    const set = new Set<string>(subcategoriesByCategory[form.category] ?? []);
    transactions.forEach((t) => {
      if (t.amount < 0 && t.category === form.category && t.subcategory) set.add(t.subcategory);
    });
    return [...set];
  }, [transactions, form.category]);

  useEffect(() => {
    fetchTransactions()
      .then(setTransactions)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить транзакции')))
      .finally(() => setLoading(false));
    fetchPeople()
      .then(setPeople)
      .catch(() => setPeople([]));
    fetchTransactionComments()
      .then(setComments)
      .catch(() => {});
  }, []);

  const canSubmit = form.date && form.amount && form.purpose && form.category && form.paidBy && form.paidFrom;

  function openAddModal() {
    setEditingId(null);
    setEditingTransaction(null);
    setForm(emptyForm);
    setSubmitError(null);
    setOpen(true);
  }

  function openEditModal(t: Transaction) {
    setEditingId(t.id);
    setEditingTransaction(t);
    setForm(transactionToForm(t));
    setSubmitError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // Курс фиксируется один раз, при создании — правка старой транзакции
      // сохраняет её исходный rateDate, а не переезжает на курс сегодняшнего
      // дня редактирования (см. комментарий у editingTransaction выше).
      const rateDate = editingId ? (editingTransaction?.rateDate ?? '') : (await fetchTodayRate()).date;
      const payload = {
        date: form.date,
        amount: Math.abs(Number(form.amount)) * (form.kind === 'Доход' ? 1 : -1),
        currency: form.currency,
        purpose: form.purpose,
        category: form.category,
        subcategory: form.kind === 'Расход' ? form.subcategory : '',
        paidBy: form.paidBy,
        paidFrom: form.paidFrom,
        compensated: form.compensated === 'Да',
        rateDate,
      };
      if (editingId) {
        const updated = await updateTransaction(editingId, payload);
        setTransactions((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
      } else {
        const created = await insertTransaction(payload);
        setTransactions((prev) => [created, ...prev]);
      }
      setForm(emptyForm);
      setEditingId(null);
      setEditingTransaction(null);
      setOpen(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить транзакцию'));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleCompensated(t: Transaction) {
    if (togglingId) return;
    setTogglingId(t.id);
    setToggleError(null);
    const next = { ...t, compensated: !t.compensated };
    setTransactions((prev) => prev.map((x) => (x.id === t.id ? next : x)));
    try {
      const { id, ...payload } = next;
      const updated = await updateTransaction(id, payload);
      setTransactions((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (err) {
      setTransactions((prev) => prev.map((x) => (x.id === t.id ? t : x)));
      setToggleError(errorMessage(err, 'Не удалось изменить статус'));
    } finally {
      setTogglingId(null);
    }
  }

  const monthTotals = calculateMonthTotals(transactions);

  return (
    <>
      <PageHeader
        title="Транзакции"
        action={
          <>
            <Link
              to="/admin/transactions/report"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
            >
              <FileBarChart className="h-4 w-4" />
              Отчёт P&L
            </Link>
            <Button icon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
              Добавить транзакцию
            </Button>
          </>
        }
      />

      <Card className="flex flex-col gap-4 p-0">
        {/* От md и шире — таблица-грид. Ниже md — карточки (см. блок md:hidden). */}
        <div className="hidden overflow-x-auto md:block">
          <div className="grid min-w-[1050px] grid-cols-[100px_120px_1.6fr_1fr_1fr_1fr_110px_44px_44px] gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
            <span>Дата</span>
            <span>Сумма</span>
            <span>Назначение</span>
            <span>Категория</span>
            <span>Кто платил</span>
            <span>Откуда платил</span>
            <span>В расчете</span>
            <span />
            <span />
          </div>
          {transactions.map((t) => (
            <div
              key={t.id}
              className="grid min-w-[1050px] grid-cols-[100px_120px_1.6fr_1fr_1fr_1fr_110px_44px_44px] items-center gap-4 border-t border-border px-6 py-4 text-sm"
            >
              <span className="text-ink-muted">{formatDate(t.date)}</span>
              <span className="font-semibold text-ink">{formatAmount(t.amount, t.currency)}</span>
              <span className="text-ink">{t.purpose}</span>
              <span>
                <Badge style={{ backgroundColor: categoryColor(t.category).bg, color: categoryColor(t.category).text }}>
                  {t.subcategory ? `${t.category} — ${t.subcategory}` : t.category}
                </Badge>
              </span>
              <span className="text-ink-muted">{t.paidBy}</span>
              <span className="text-ink-muted">{t.paidFrom}</span>
              <span>
                <button
                  type="button"
                  onClick={() => toggleCompensated(t)}
                  disabled={togglingId === t.id}
                  className="disabled:opacity-50"
                  aria-label="Переключить статус «В расчете»"
                >
                  <Badge tone={t.compensated ? 'success' : 'warning'}>{t.compensated ? 'Да' : 'Нет'}</Badge>
                </button>
              </span>
              <button
                type="button"
                onClick={() => setCommentsTransaction(t)}
                className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                aria-label="Комментарии"
              >
                <MessageSquare className="h-4 w-4" />
                {(commentsByTransaction.get(t.id)?.length ?? 0) > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                    {commentsByTransaction.get(t.id)!.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => openEditModal(t)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                aria-label="Редактировать транзакцию"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          ))}
          {loading && (
            <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем транзакции...
            </div>
          )}
          {!loading && loadError && (
            <div className="px-6 py-10 text-center text-sm text-danger">{loadError}</div>
          )}
          {!loading && !loadError && transactions.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-ink-muted">Транзакций пока нет</div>
          )}
        </div>

        <div className="flex flex-col gap-3 p-4 md:hidden">
          {transactions.map((t) => (
            <div key={t.id} className="flex flex-col gap-2.5 rounded-control border border-border p-3.5">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words font-medium text-ink">{t.purpose}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCommentsTransaction(t)}
                    className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                    aria-label="Комментарии"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {(commentsByTransaction.get(t.id)?.length ?? 0) > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                        {commentsByTransaction.get(t.id)!.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(t)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                    aria-label="Редактировать транзакцию"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                <span>{formatDate(t.date)}</span>
                <span className="font-semibold text-ink">{formatAmount(t.amount, t.currency)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge style={{ backgroundColor: categoryColor(t.category).bg, color: categoryColor(t.category).text }}>
                  {t.subcategory ? `${t.category} — ${t.subcategory}` : t.category}
                </Badge>
                <button
                  type="button"
                  onClick={() => toggleCompensated(t)}
                  disabled={togglingId === t.id}
                  className="disabled:opacity-50"
                  aria-label="Переключить статус «В расчете»"
                >
                  <Badge tone={t.compensated ? 'success' : 'warning'}>
                    {t.compensated ? 'В расчете' : 'Не в расчете'}
                  </Badge>
                </button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                {t.paidBy && <span>Платил: {t.paidBy}</span>}
                {t.paidFrom && <span>Откуда: {t.paidFrom}</span>}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем транзакции...
            </div>
          )}
          {!loading && loadError && <div className="py-10 text-center text-sm text-danger">{loadError}</div>}
          {!loading && !loadError && transactions.length === 0 && (
            <div className="py-10 text-center text-sm text-ink-muted">Транзакций пока нет</div>
          )}
        </div>

        {!loading && !loadError && (
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-black/[0.025] px-4 py-3 text-sm sm:px-6">
              <span className="font-medium text-ink-muted">Итого расходы за месяц</span>
              <span className="font-bold text-danger">{formatTotalsMap(monthTotals.expenses)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-black/[0.025] px-4 py-3 text-sm sm:px-6">
              <span className="font-medium text-ink-muted">Итого доходы за месяц</span>
              <span className="font-bold text-success">{formatTotalsMap(monthTotals.income)}</span>
            </div>
          </div>
        )}
      </Card>

      {toggleError && <p className="text-sm text-danger">{toggleError}</p>}

      {!loading &&
        !loadError &&
        (calculateBalances(transactions, splitPayers).length > 0 ||
          calculateSoloDebts(transactions, soloPayers).length > 0) && (
          <Card className="flex flex-col gap-3">
            <span className="text-lg font-bold text-ink">Непогашенный остаток</span>
            {calculateBalances(transactions, splitPayers).map(({ currency, totals, debtor, creditor, owed }) => (
              <div
                key={currency}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-muted px-4 py-3"
              >
                <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
                  {splitPayers.map((p) => (
                    <span key={p}>
                      {p}: <span className="font-semibold text-ink">{formatAmount(totals[p] ?? 0, currency)}</span>
                    </span>
                  ))}
                </div>
                {owed === 0 ? (
                  <Badge tone="success">Баланс сведён</Badge>
                ) : (
                  <Badge tone="primary">
                    {debtor} должен {creditor}: {formatAmount(owed, currency)}
                  </Badge>
                )}
              </div>
            ))}
            {calculateSoloDebts(transactions, soloPayers).map(({ payer, currency, amount }) => (
              <div
                key={`${payer}-${currency}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-muted px-4 py-3"
              >
                <span className="text-sm text-ink-muted">
                  {payer}: <span className="font-semibold text-ink">{formatAmount(amount, currency)}</span>
                </span>
                <Badge tone="primary">
                  Должны {payer}: {formatAmount(amount, currency)}
                </Badge>
              </div>
            ))}
          </Card>
        )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Редактировать транзакцию' : 'Новая транзакция'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <ToggleGroup
            label="Тип операции"
            options={['Расход', 'Доход']}
            value={form.kind}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                kind: v as OperationKind,
                paidBy: v === 'Доход' ? (incomePayers[0] ?? '') : (payers[0] ?? ''),
                category: v === 'Доход' ? incomeCategories[0] : categories[0],
                subcategory: '',
              }))
            }
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Дата"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <Input
                label="Сумма"
                type="number"
                step="0.01"
                placeholder="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
              <Select
                label="Валюта"
                options={[...currencies]}
                value={form.currency}
                onChange={(v) => setForm((f) => ({ ...f, currency: v as Currency }))}
              />
            </div>
          </div>

          <Input
            label="Назначение"
            placeholder="На что потрачено"
            value={form.purpose}
            onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
            required
          />

          <AddableSelect
            label="Категория"
            options={form.kind === 'Доход' ? knownIncomeCategories : knownExpenseCategories}
            value={form.category}
            onChange={(v) => setForm((f) => ({ ...f, category: v, subcategory: '' }))}
            addLabel="+ Добавить категорию"
            newPlaceholder="Название категории"
          />

          {form.kind === 'Расход' && (
            <AddableSelect
              label="Подкатегория"
              options={knownSubcategories}
              value={form.subcategory}
              onChange={(v) => setForm((f) => ({ ...f, subcategory: v }))}
              addLabel="+ Добавить подкатегорию"
              newPlaceholder="Название подкатегории"
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AddableSelect
              label="Кто платил"
              options={form.kind === 'Доход' ? knownIncomePayers : knownPayers}
              value={form.paidBy}
              onChange={(v) => setForm((f) => ({ ...f, paidBy: v }))}
              addLabel="+ Добавить человека"
              newPlaceholder="Имя"
            />
            <AddableSelect
              label="Откуда платил"
              options={knownSources}
              value={form.paidFrom}
              onChange={(v) => setForm((f) => ({ ...f, paidFrom: v }))}
              addLabel="+ Добавить источник"
              newPlaceholder="Карта, счёт, наличные..."
            />
          </div>

          <ToggleGroup
            label="В расчете"
            options={['Да', 'Нет']}
            value={form.compensated}
            onChange={(v) => setForm((f) => ({ ...f, compensated: v }))}
          />

          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>

      <TransactionCommentsModal
        transaction={commentsTransaction}
        comments={commentsTransaction ? (commentsByTransaction.get(commentsTransaction.id) ?? []) : []}
        onClose={() => setCommentsTransaction(null)}
        onAdded={(comment) => setComments((prev) => [...prev, comment])}
        onDeleted={(id) => setComments((prev) => prev.filter((c) => c.id !== id))}
      />
    </>
  );
}
