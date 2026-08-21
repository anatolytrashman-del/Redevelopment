import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, TriangleAlert } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { cn } from '../lib/cn';
import type { Transaction } from '../data/transactions';
import type { ExchangeRate } from '../data/exchangeRates';
import { fetchTransactions } from '../lib/transactionsApi';
import { fetchExchangeRates } from '../lib/exchangeRatesApi';
import { convertToUsd } from '../lib/currencyConvert';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const MONTH_LABELS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function formatUsd(value: number): string {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

interface CategoryRow {
  category: string;
  monthly: number[];
  total: number;
}

// Строки P&L по категориям расхода/дохода за выбранный год — сумма (по
// модулю) в USD по месяцам, конвертированная по курсу, зафиксированному на
// rateDate каждой транзакции (см. currencyConvert.ts). unconverted — сколько
// транзакций этого вида пропущено из-за отсутствия курса на их rateDate
// (не должно происходить в норме, но явно считаем и показываем, а не молча
// теряем из отчёта — см. CLAUDE.md принцип "никаких тихих потерь").
function buildCategoryRows(
  transactions: Transaction[],
  ratesByDate: Map<string, ExchangeRate>,
  year: string,
  isIncome: boolean,
): { rows: CategoryRow[]; unconverted: number } {
  const byCategory = new Map<string, number[]>();
  let unconverted = 0;
  for (const t of transactions) {
    if (!t.date.startsWith(year)) continue;
    if (isIncome ? t.amount <= 0 : t.amount >= 0) continue;
    const usd = convertToUsd(Math.abs(t.amount), t.currency, ratesByDate.get(t.rateDate));
    if (usd === null) {
      unconverted++;
      continue;
    }
    const monthIndex = Number(t.date.slice(5, 7)) - 1;
    if (!byCategory.has(t.category)) byCategory.set(t.category, Array(12).fill(0));
    byCategory.get(t.category)![monthIndex] += usd;
  }
  const rows = [...byCategory.entries()]
    .map(([category, monthly]) => ({ category, monthly, total: monthly.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total);
  return { rows, unconverted };
}

function sumMonthly(rows: CategoryRow[]): number[] {
  const totals = Array(12).fill(0);
  for (const row of rows) {
    row.monthly.forEach((v, i) => {
      totals[i] += v;
    });
  }
  return totals;
}

export function TransactionsReport() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [year, setYear] = useState(() => String(new Date().getFullYear()));

  useEffect(() => {
    Promise.all([fetchTransactions(), fetchExchangeRates()])
      .then(([t, r]) => {
        setTransactions(t);
        setRates(r);
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить данные для отчёта')))
      .finally(() => setLoading(false));
  }, []);

  const ratesByDate = useMemo(() => new Map(rates.map((r) => [r.date, r])), [rates]);

  const years = useMemo(() => {
    const set = new Set<string>([String(new Date().getFullYear())]);
    transactions.forEach((t) => set.add(t.date.slice(0, 4)));
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [transactions]);

  const income = useMemo(
    () => buildCategoryRows(transactions, ratesByDate, year, true),
    [transactions, ratesByDate, year],
  );
  const expense = useMemo(
    () => buildCategoryRows(transactions, ratesByDate, year, false),
    [transactions, ratesByDate, year],
  );

  const incomeMonthly = sumMonthly(income.rows);
  const expenseMonthly = sumMonthly(expense.rows);
  const incomeTotal = incomeMonthly.reduce((s, v) => s + v, 0);
  const expenseTotal = expenseMonthly.reduce((s, v) => s + v, 0);
  const netMonthly = MONTH_LABELS.map((_, i) => incomeMonthly[i] - expenseMonthly[i]);
  const netTotal = incomeTotal - expenseTotal;
  const unconverted = income.unconverted + expense.unconverted;

  return (
    <>
      <PageHeader title="Отчёт P&L" />

      <Link
        to="/admin/transactions"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Все транзакции
      </Link>

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Считаем отчёт...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && (
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-4 p-5">
            <ToggleGroup label="Год" options={years} value={year} onChange={setYear} />
            <p className="text-xs text-ink-faint">
              Все суммы переведены в USD по курсу Нацбанка (bnb.by), зафиксированному на дату сохранения каждой
              транзакции.
            </p>
          </Card>

          {unconverted > 0 && (
            <Card className="flex items-center gap-3 border border-warning/40 bg-warning-bg p-4 text-sm text-warning">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {unconverted} {unconverted === 1 ? 'транзакция' : 'транзакций'} без зафиксированного курса — не учтены
              в отчёте.
            </Card>
          )}

          <PnlTable
            year={year}
            incomeRows={income.rows}
            incomeMonthly={incomeMonthly}
            incomeTotal={incomeTotal}
            expenseRows={expense.rows}
            expenseMonthly={expenseMonthly}
            expenseTotal={expenseTotal}
            netMonthly={netMonthly}
            netTotal={netTotal}
          />
        </div>
      )}
    </>
  );
}

function PnlTable({
  year,
  incomeRows,
  incomeMonthly,
  incomeTotal,
  expenseRows,
  expenseMonthly,
  expenseTotal,
  netMonthly,
  netTotal,
}: {
  year: string;
  incomeRows: CategoryRow[];
  incomeMonthly: number[];
  incomeTotal: number;
  expenseRows: CategoryRow[];
  expenseMonthly: number[];
  expenseTotal: number;
  netMonthly: number[];
  netTotal: number;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="text-lg font-bold text-ink">Отчёт о прибылях и убытках — {year}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-2 py-2 font-medium">Статья</th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="px-2 py-2 text-right font-medium">
                  {m}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Итого</th>
            </tr>
          </thead>
          <tbody>
            <SectionRow label="Доходы" />
            {incomeRows.map((row) => (
              <PnlRow key={row.category} label={row.category} values={row.monthly} total={row.total} />
            ))}
            {incomeRows.length === 0 && <EmptyRow label="Доходов за этот год нет" />}
            <PnlRow label="Итого доходов" values={incomeMonthly} total={incomeTotal} bold />

            <SectionRow label="Расходы" />
            {expenseRows.map((row) => (
              <PnlRow key={row.category} label={row.category} values={row.monthly} total={row.total} />
            ))}
            {expenseRows.length === 0 && <EmptyRow label="Расходов за этот год нет" />}
            <PnlRow label="Итого расходов" values={expenseMonthly} total={expenseTotal} bold />

            <PnlRow label="Чистая прибыль" values={netMonthly} total={netTotal} bold tone="net" />
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SectionRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={100} className="px-2 pt-4 pb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
        {label}
      </td>
    </tr>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={100} className="px-2 py-2 text-sm text-ink-faint">
        {label}
      </td>
    </tr>
  );
}

function PnlRow({
  label,
  values,
  total,
  bold,
  tone,
}: {
  label: string;
  values: number[];
  total: number;
  bold?: boolean;
  tone?: 'net';
}) {
  return (
    <tr className="border-b border-border/50">
      <td className={cn('px-2 py-1.5', bold ? 'font-semibold text-ink' : 'text-ink')}>{label}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={cn(
            'whitespace-nowrap px-2 py-1.5 text-right',
            bold && 'font-semibold',
            tone === 'net' && (v >= 0 ? 'text-success' : 'text-danger'),
          )}
        >
          {formatUsd(v)}
        </td>
      ))}
      <td
        className={cn(
          'whitespace-nowrap px-2 py-1.5 text-right',
          bold && 'font-semibold',
          tone === 'net' && (total >= 0 ? 'text-success' : 'text-danger'),
        )}
      >
        {formatUsd(total)}
      </td>
    </tr>
  );
}
