import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, TriangleAlert } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import type { FinModel } from '../data/finModels';
import type { RealtyObject } from '../data/objects';
import { fetchFinModel } from '../lib/finModelsApi';
import { fetchObject } from '../lib/objectsApi';
import { calculateFinModel, type FinResult } from '../lib/finModelCalc';
import { Byn, formatByn } from '../lib/finModelFormat';
import { cn } from '../lib/cn';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Отдельная страница просмотра финмодели — все параметры вводятся на
// странице редактирования (FinModelDetail), здесь только результат: KPI +
// классическая P&L-таблица (статьи по строкам, периоды по столбцам, как
// принято в отчётах о прибылях и убытках).
export function FinModelReport() {
  const { id } = useParams();
  const [model, setModel] = useState<FinModel | null>(null);
  const [object, setObject] = useState<RealtyObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    fetchFinModel(id)
      .then((m) => {
        setModel(m);
        return fetchObject(m.objectId).then(setObject).catch(() => {});
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить финмодель')))
      .finally(() => setLoading(false));
  }, [id]);

  const result = model ? calculateFinModel(model) : null;

  return (
    <>
      <PageHeader title={model ? model.name : 'Финмодель'} />

      <Link
        to={id ? `/admin/finmodels/${id}` : '/admin/finmodels'}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад к параметрам
      </Link>

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Считаем финмодель...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && model && result && (
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-0.5 p-5">
            <span className="text-xs uppercase tracking-wide text-ink-faint">Объект</span>
            <span className="text-sm font-semibold text-ink">
              {object ? (object.name ? `${object.name} — ${object.address}` : object.address) : '...'}
            </span>
          </Card>

          <KpiSection result={result} />

          <PnlTable model={model} result={result} />
        </div>
      )}
    </>
  );
}

export function KpiSection({ result }: { result: FinResult }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Итог за горизонт" value={<Byn value={result.netProfit} />} tone={result.netProfit >= 0 ? 'success' : 'danger'} />
        <Kpi
          label="Выход в плюс"
          value={result.breakEvenMonth ? `${result.breakEvenMonth.label} (мес. ${result.breakEvenMonth.index})` : '— не выходит'}
          tone={result.breakEvenMonth ? 'success' : 'danger'}
        />
        <Kpi
          label="Макс. просадка"
          value={<Byn value={Math.abs(result.maxDrawdown)} />}
          tone="neutral"
          hint="Сколько всего денег нужно завести в проект до самоокупаемости"
        />
        <Kpi label="Аренда за горизонт" value={<Byn value={result.totalRentIncome} />} tone="neutral" />
        <Kpi label="Продажи за горизонт" value={<Byn value={result.totalSaleIncome} />} tone="neutral" />
        <Kpi label="Налоги за горизонт" value={<Byn value={result.totalTax} />} tone="neutral" />
        <Kpi
          label="Нагрузка на арендаторов сверх аренды"
          value={<Byn value={result.totalReimbursedExpense} />}
          tone="neutral"
          hint="Сумма статей 'на арендаторов' за весь горизонт — компенсация расходов, не входит в чистую прибыль и не входит в аренду"
        />
        <Kpi
          label="Амортизация за горизонт"
          value={<Byn value={result.totalAmortization} />}
          tone="neutral"
          hint="Не касса — только снижает налоговую базу, не входит в расходы и чистый денежный поток"
        />
      </div>
    </Card>
  );
}

function Kpi({ label, value, tone, hint }: { label: string; value: React.ReactNode; tone: 'success' | 'danger' | 'neutral'; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-control bg-surface-muted p-3" title={hint}>
      <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
      <span className={cn('text-sm font-bold', tone === 'success' && 'text-success', tone === 'danger' && 'text-danger', tone === 'neutral' && 'text-ink')}>
        {value}
      </span>
    </div>
  );
}

export function PnlTable({ model, result }: { model: FinModel; result: FinResult }) {
  const years = result.years;
  const incomeCats = result.categoryBreakdown.filter((c) => c.kind === 'income' && c.total !== 0);
  const expenseCats = result.categoryBreakdown.filter((c) => c.kind === 'expense');
  const totalLeasing = years.reduce((s, y) => s + y.leasing, 0);
  const lastCumulative = years.length ? years[years.length - 1].cumulativeEnd : 0;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="text-lg font-bold text-ink">Отчёт о прибылях и убытках</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-2 py-2 font-medium">Статья</th>
              {years.map((y) => (
                <th key={y.year} className="px-2 py-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    {y.year}
                    {y.limitExceeded && (
                      <TriangleAlert
                        className="h-3 w-3 text-warning"
                        aria-label="лимит ИП"
                      />
                    )}
                  </span>
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Итого</th>
            </tr>
          </thead>
          <tbody>
            <SectionRow label="Доходы" />
            <PnlRow label="Аренда" values={years.map((y) => y.rentIncome)} total={result.totalRentIncome} />
            <PnlRow label="Продажи" values={years.map((y) => y.saleIncome)} total={result.totalSaleIncome} />
            {incomeCats.map((c) => (
              <PnlRow key={c.categoryId} label={c.title} values={c.totalByYear} total={c.total} />
            ))}
            <PnlRow label="Итого доходов" values={years.map((y) => y.income)} total={result.totalIncome} bold />

            <SectionRow label="Расходы" />
            {expenseCats.map((c) => (
              <PnlRow key={c.categoryId} label={c.title} values={c.totalByYear} total={c.total} />
            ))}
            <PnlRow label="Лизинг" values={years.map((y) => y.leasing)} total={totalLeasing} />
            <PnlRow label="Резерв на капремонт" values={years.map((y) => y.capexReserve)} total={result.totalCapexReserve} />
            <PnlRow label="Итого расходов" values={years.map((y) => y.expense)} total={result.totalExpense} bold />
            <PnlRow
              label="из них компенсировано арендаторами"
              values={years.map((y) => -y.reimbursedExpense)}
              total={-result.totalReimbursedExpense}
              muted
              title="Не режет чистую прибыль — переложено на арендаторов сверх аренды"
            />
            <PnlRow
              label="Чистые расходы"
              values={years.map((y) => y.expense - y.reimbursedExpense)}
              total={result.totalExpense - result.totalReimbursedExpense}
              bold
            />
            <PnlRow
              label="Амортизация (справочно, не касса)"
              values={years.map((y) => y.amortization)}
              total={result.totalAmortization}
              muted
              title="Не входит в расходы выше — только снижает налоговую базу"
            />

            <PnlRow
              label="Прибыль до налога"
              values={years.map((y) => y.net + y.tax)}
              total={result.netProfit + result.totalTax}
              bold
            />
            <PnlRow
              label="Налог"
              values={years.map((y) => y.tax)}
              total={result.totalTax}
              regimeByYear={years.map((y) => y.taxRegime)}
            />
            <PnlRow label="Чистая прибыль" values={years.map((y) => y.net)} total={result.netProfit} bold tone="net" />
            <PnlRow label="Накопленный итог" values={years.map((y) => y.cumulativeEnd)} total={lastCumulative} bold tone="net" />
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-faint">
        Лимит выручки ИП — {formatByn(model.params.revenueLimitByn)} в календарный год, превышение отмечено{' '}
        <TriangleAlert className="inline h-3 w-3 text-warning" /> у года.
      </p>
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

function PnlRow({
  label,
  values,
  total,
  bold,
  muted,
  tone,
  title,
  regimeByYear,
}: {
  label: string;
  values: number[];
  total: number;
  bold?: boolean;
  muted?: boolean;
  tone?: 'net';
  title?: string;
  regimeByYear?: Array<'revenue' | 'profit'>;
}) {
  return (
    <tr className="border-b border-border/50" title={title}>
      <td className={cn('px-2 py-1.5', bold ? 'font-semibold text-ink' : muted ? 'italic text-ink-faint' : 'text-ink')}>{label}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={cn(
            'px-2 py-1.5 text-right',
            bold && 'font-semibold',
            muted && 'italic text-ink-faint',
            !muted && tone === 'net' && (v >= 0 ? 'text-success' : 'text-danger'),
            !muted && !tone && bold && 'text-ink',
          )}
        >
          <Byn value={v} />
          {regimeByYear && <span className="ml-1 text-[10px] text-ink-faint">{regimeByYear[i] === 'profit' ? 'от приб.' : 'от об.'}</span>}
        </td>
      ))}
      <td
        className={cn(
          'px-2 py-1.5 text-right',
          bold && 'font-semibold',
          muted && 'italic text-ink-faint',
          !muted && tone === 'net' && (total >= 0 ? 'text-success' : 'text-danger'),
        )}
      >
        <Byn value={total} />
      </td>
    </tr>
  );
}
