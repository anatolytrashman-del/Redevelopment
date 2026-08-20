import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, X, Trash2, ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { BynSign } from '../components/ui/BynSign';
import {
  LEASING_CURRENCY_SYMBOLS,
  type FinCategory,
  type FinEntry,
  type FinModel,
  type FinSchedule,
  type LeasingCurrency,
} from '../data/finModels';
import type { RealtyObject } from '../data/objects';
import { fetchFinModel, updateFinModel } from '../lib/finModelsApi';
import { fetchObject } from '../lib/objectsApi';
import { calculateFinModel, type FinYear } from '../lib/finModelCalc';
import { cn } from '../lib/cn';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatNum(value: number): string {
  return Math.round(value).toLocaleString('ru-RU');
}

// Для plain-text мест (title-атрибуты), где SVG-знак рубля не отрисуется.
function formatByn(value: number): string {
  return `${formatNum(value)} Br`;
}

// Сумма в BYN со знаком рубля (см. BynSign — у знака нет кодовой точки в
// Юникоде, поэтому JSX, а не строка).
function Byn({ value }: { value: number }) {
  return (
    <span className="whitespace-nowrap">
      {formatNum(value)}&nbsp;
      <BynSign />
    </span>
  );
}

// '' <-> null для числовых полей: пустая строка в инпуте = "не заполнено",
// не ноль (см. "числовые ловушки" в CLAUDE.md).
function numOrNull(v: string): number | null {
  return v === '' ? null : Number(v);
}

const SCHEDULE_LABELS: Record<FinSchedule['type'], string> = {
  monthly: 'Ежемесячно',
  once: 'Разово',
  yearly: 'Ежегодно',
};

// Страница = загрузка/сохранение, вся вёрстка и правки — в FinModelEditor
// (он же используется мок-тестами без базы).
export function FinModelDetail() {
  const { id } = useParams();
  const [model, setModel] = useState<FinModel | null>(null);
  const [object, setObject] = useState<RealtyObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Снимок последнего сохранённого состояния — для индикатора "есть
  // несохранённые правки" (сравнение по JSON, модель небольшая).
  const savedRef = useRef<string>('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    fetchFinModel(id)
      .then((m) => {
        setModel(m);
        savedRef.current = JSON.stringify(m);
        return fetchObject(m.objectId).then(setObject).catch(() => {});
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить финмодель')))
      .finally(() => setLoading(false));
  }, [id]);

  const dirty = model != null && JSON.stringify(model) !== savedRef.current;

  async function handleSave() {
    if (!model || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateFinModel(model.id, {
        name: model.name.trim() || 'Без названия',
        params: model.params,
        leasing: model.leasing,
        categories: model.categories,
      });
      setModel(updated);
      savedRef.current = JSON.stringify(updated);
    } catch (err) {
      setSaveError(errorMessage(err, 'Не удалось сохранить финмодель'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Финмодель"
        action={
          <Button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {saving ? 'Сохраняем...' : dirty ? 'Сохранить' : 'Сохранено'}
          </Button>
        }
      />

      <Link to="/admin/finmodels" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        Все финмодели
      </Link>

      {saveError && <p className="text-sm text-danger">{saveError}</p>}

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем финмодель...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && model && <FinModelEditor model={model} object={object} onChange={setModel} />}
    </>
  );
}

export function FinModelEditor({
  model,
  object,
  onChange,
}: {
  model: FinModel;
  object: RealtyObject | null;
  onChange: (m: FinModel) => void;
}) {
  const result = useMemo(() => calculateFinModel(model), [model]);

  function patchModel(patch: Partial<FinModel>) {
    onChange({ ...model, ...patch });
  }

  function patchCategory(categoryId: string, patch: Partial<FinCategory>) {
    onChange({ ...model, categories: model.categories.map((c) => (c.id === categoryId ? { ...c, ...patch } : c)) });
  }

  function addCategory(kind: FinCategory['kind']) {
    onChange({
      ...model,
      categories: [
        ...model.categories,
        {
          id: crypto.randomUUID(),
          title: kind === 'income' ? 'Новая категория доходов' : 'Новая категория расходов',
          kind,
          entries: [],
        },
      ],
    });
  }

  function removeCategory(categoryId: string) {
    if (!window.confirm('Удалить категорию со всеми статьями?')) return;
    onChange({ ...model, categories: model.categories.filter((c) => c.id !== categoryId) });
  }

  function addEntry(categoryId: string) {
    onChange({
      ...model,
      categories: model.categories.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              entries: [
                ...c.entries,
                {
                  id: crypto.randomUUID(),
                  label: '',
                  amount: null,
                  schedule: { type: 'monthly', fromMonth: 1, toMonth: null },
                  deductible: c.kind === 'expense',
                  reimbursable: false,
                },
              ],
            }
          : c,
      ),
    });
  }

  function patchEntry(categoryId: string, entryId: string, patch: Partial<FinEntry>) {
    onChange({
      ...model,
      categories: model.categories.map((c) =>
        c.id === categoryId ? { ...c, entries: c.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)) } : c,
      ),
    });
  }

  function removeEntry(categoryId: string, entryId: string) {
    onChange({
      ...model,
      categories: model.categories.map((c) =>
        c.id === categoryId ? { ...c, entries: c.entries.filter((e) => e.id !== entryId) } : c,
      ),
    });
  }

  const incomeCategories = model.categories.filter((c) => c.kind === 'income');
  const expenseCategories = model.categories.filter((c) => c.kind === 'expense');

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-ink-faint">Объект</span>
          <span className="text-sm font-semibold text-ink">
            {object ? (object.name ? `${object.name} — ${object.address}` : object.address) : '...'}
          </span>
        </div>
        <Input label="Название сценария" value={model.name} onChange={(e) => patchModel({ name: e.target.value })} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input
            label="Старт (месяц 1)"
            type="month"
            value={model.params.startDate}
            onChange={(e) => patchModel({ params: { ...model.params, startDate: e.target.value } })}
          />
          <Input
            label="Горизонт, мес."
            type="number"
            value={model.params.horizonMonths}
            onChange={(e) => patchModel({ params: { ...model.params, horizonMonths: Number(e.target.value) || 60 } })}
          />
          <Input
            label="Налог от оборота, %"
            type="number"
            value={model.params.taxRevenuePct}
            onChange={(e) => patchModel({ params: { ...model.params, taxRevenuePct: Number(e.target.value) || 0 } })}
          />
          <Input
            label="Налог от прибыли, %"
            type="number"
            value={model.params.taxProfitPct}
            onChange={(e) => patchModel({ params: { ...model.params, taxProfitPct: Number(e.target.value) || 0 } })}
          />
        </div>
        <p className="text-xs text-ink-faint">
          Все суммы в BYN. Налог на каждый год считается в обоих режимах, в итог идёт меньший. Лимит выручки ИП —{' '}
          <Byn value={model.params.revenueLimitByn} /> в календарный год, превышение подсвечивается в сводке.
        </p>
      </Card>

      <LeasingCard model={model} result={result} patchModel={patchModel} />

      <SummarySection model={model} result={result} />

      <CategoriesSection
        title="Доходы"
        categories={incomeCategories}
        onAddCategory={() => addCategory('income')}
        onRemoveCategory={removeCategory}
        onPatchCategory={patchCategory}
        onAddEntry={addEntry}
        onPatchEntry={patchEntry}
        onRemoveEntry={removeEntry}
      />

      <CategoriesSection
        title="Расходы"
        categories={expenseCategories}
        onAddCategory={() => addCategory('expense')}
        onRemoveCategory={removeCategory}
        onPatchCategory={patchCategory}
        onAddEntry={addEntry}
        onPatchEntry={patchEntry}
        onRemoveEntry={removeEntry}
      />
    </div>
  );
}

function LeasingCard({
  model,
  result,
  patchModel,
}: {
  model: FinModel;
  result: ReturnType<typeof calculateFinModel>;
  patchModel: (patch: Partial<FinModel>) => void;
}) {
  const sym = LEASING_CURRENCY_SYMBOLS[model.leasing.currency];
  const isByn = model.leasing.currency === 'BYN';
  const payment = result.monthlyLeasingPayment;
  const paymentByn =
    payment != null && !result.leasingRateMissing ? payment * (isByn ? 1 : (model.leasing.exchangeRate ?? 0)) : null;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="text-lg font-bold text-ink">Лизинг</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Input
          label={`Сумма договора, ${sym}`}
          type="number"
          value={model.leasing.contractSum ?? ''}
          onChange={(e) => patchModel({ leasing: { ...model.leasing, contractSum: numOrNull(e.target.value) } })}
        />
        <Input
          label={`Аванс, ${sym}`}
          type="number"
          value={model.leasing.downPayment ?? ''}
          onChange={(e) => patchModel({ leasing: { ...model.leasing, downPayment: numOrNull(e.target.value) } })}
        />
        <Input
          label="Срок, мес."
          type="number"
          value={model.leasing.termMonths ?? ''}
          onChange={(e) => patchModel({ leasing: { ...model.leasing, termMonths: numOrNull(e.target.value) } })}
        />
        <Input
          label="Ставка, %/год"
          type="number"
          value={model.leasing.annualRatePct ?? ''}
          onChange={(e) => patchModel({ leasing: { ...model.leasing, annualRatePct: numOrNull(e.target.value) } })}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-muted">Валюта договора</span>
          <select
            value={model.leasing.currency}
            onChange={(e) => patchModel({ leasing: { ...model.leasing, currency: e.target.value as LeasingCurrency } })}
            className="rounded-control border border-transparent bg-surface-muted px-4 py-3 text-sm text-ink outline-none focus:border-primary"
          >
            <option value="USD">Доллар ($)</option>
            <option value="EUR">Евро (€)</option>
            <option value="BYN">Бел. рубль</option>
          </select>
        </label>
        {!isByn && (
          <Input
            label={`Курс BYN за 1 ${sym}`}
            type="number"
            step="0.0001"
            value={model.leasing.exchangeRate ?? ''}
            onChange={(e) => patchModel({ leasing: { ...model.leasing, exchangeRate: numOrNull(e.target.value) } })}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={model.leasing.deductible}
            onChange={(e) => patchModel({ leasing: { ...model.leasing, deductible: e.target.checked } })}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Зачитывать платежи как расходы ИП
        </label>
        <span className="text-sm text-ink-muted">
          Платёж:{' '}
          {payment == null ? (
            <span className="font-semibold text-ink">— заполните сумму и срок</span>
          ) : (
            <span className="font-semibold text-ink">
              {formatNum(payment)} {sym}/мес
              {paymentByn != null && !isByn && (
                <span className="text-ink-muted">
                  {' '}
                  ≈ <Byn value={paymentByn} />
                  /мес
                </span>
              )}
            </span>
          )}
        </span>
      </div>
      {result.leasingRateMissing && (
        <p className="text-sm font-medium text-warning">
          Укажите курс — без него лизинг не попадает в расчёт (пересчитывать {sym} в BYN 1:1 было бы обманом модели).
        </p>
      )}
    </Card>
  );
}

function CategoriesSection({
  title,
  categories,
  onAddCategory,
  onRemoveCategory,
  onPatchCategory,
  onAddEntry,
  onPatchEntry,
  onRemoveEntry,
}: {
  title: string;
  categories: FinCategory[];
  onAddCategory: () => void;
  onRemoveCategory: (categoryId: string) => void;
  onPatchCategory: (categoryId: string, patch: Partial<FinCategory>) => void;
  onAddEntry: (categoryId: string) => void;
  onPatchEntry: (categoryId: string, entryId: string, patch: Partial<FinEntry>) => void;
  onRemoveEntry: (categoryId: string, entryId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-lg font-bold text-ink">{title}</div>
      {categories.map((c) => (
        <Card key={c.id} className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input value={c.title} onChange={(e) => onPatchCategory(c.id, { title: e.target.value })} />
            </div>
            <button
              type="button"
              onClick={() => onRemoveCategory(c.id)}
              aria-label="Удалить категорию"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {c.entries.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                kind={c.kind}
                onPatch={(patch) => onPatchEntry(c.id, e.id, patch)}
                onRemove={() => onRemoveEntry(c.id, e.id)}
              />
            ))}
            {c.entries.length === 0 && <p className="text-sm text-ink-faint">Статей пока нет</p>}
          </div>

          <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} className="w-fit" onClick={() => onAddEntry(c.id)}>
            Добавить статью
          </Button>
        </Card>
      ))}
      <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} className="w-fit" onClick={onAddCategory}>
        Добавить категорию
      </Button>
    </div>
  );
}

function EntryRow({
  entry,
  kind,
  onPatch,
  onRemove,
}: {
  entry: FinEntry;
  kind: FinCategory['kind'];
  onPatch: (patch: Partial<FinEntry>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-control border border-border p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input placeholder="Название статьи" value={entry.label} onChange={(e) => onPatch({ label: e.target.value })} />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Удалить статью"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-32 shrink-0">
          <Input
            type="number"
            placeholder="Сумма, Br"
            value={entry.amount ?? ''}
            onChange={(e) => onPatch({ amount: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
        <select
          value={entry.schedule.type}
          onChange={(e) => onPatch({ schedule: { ...entry.schedule, type: e.target.value as FinSchedule['type'] } })}
          className="rounded-control border border-transparent bg-surface-muted px-3 py-3 text-sm text-ink outline-none focus:border-primary"
        >
          {(Object.keys(SCHEDULE_LABELS) as FinSchedule['type'][]).map((t) => (
            <option key={t} value={t}>
              {SCHEDULE_LABELS[t]}
            </option>
          ))}
        </select>
        <div className="w-24 shrink-0">
          <Input
            type="number"
            placeholder="с мес."
            title="Номер месяца модели, с которого действует статья (1 = месяц старта)"
            value={entry.schedule.fromMonth || ''}
            onChange={(e) => onPatch({ schedule: { ...entry.schedule, fromMonth: Number(e.target.value) || 1 } })}
          />
        </div>
        {entry.schedule.type !== 'once' && (
          <div className="w-24 shrink-0">
            <Input
              type="number"
              placeholder="по мес."
              title="Последний месяц действия (пусто — до конца горизонта)"
              value={entry.schedule.toMonth ?? ''}
              onChange={(e) => onPatch({ schedule: { ...entry.schedule, toMonth: e.target.value === '' ? null : Number(e.target.value) } })}
            />
          </div>
        )}
        {kind === 'expense' && (
          <>
            <label
              className="flex items-center gap-1.5 text-xs font-medium text-ink-muted"
              title="Зачитывается как расход ИП — уменьшает налоговую базу в режиме 'от прибыли'"
            >
              <input
                type="checkbox"
                checked={entry.deductible}
                onChange={(e) => onPatch({ deductible: e.target.checked })}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              расход ИП
            </label>
            <label
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium',
                entry.reimbursable ? 'text-primary' : 'text-ink-muted',
              )}
              title="Перекладывается на арендаторов (компенсация сверх аренды) — сумма остаётся в расходах, но не режет чистую прибыль"
            >
              <input
                type="checkbox"
                checked={entry.reimbursable}
                onChange={(e) => onPatch({ reimbursable: e.target.checked })}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              на арендаторов
            </label>
          </>
        )}
      </div>
    </div>
  );
}

function SummarySection({ model, result }: { model: FinModel; result: ReturnType<typeof calculateFinModel> }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="text-lg font-bold text-ink">Сводка</div>

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
        <Kpi label="Налоги за горизонт" value={<Byn value={result.totalTax} />} tone="neutral" />
        <Kpi
          label="Нагрузка на арендаторов сверх аренды"
          value={<Byn value={result.totalReimbursedExpense} />}
          tone="neutral"
          hint="Сумма статей 'на арендаторов' за весь горизонт — компенсация расходов, не входит в чистую прибыль и не входит в аренду"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-2 py-2 font-medium">Год</th>
              <th className="px-2 py-2 text-right font-medium">Доходы</th>
              <th className="px-2 py-2 text-right font-medium">Расходы</th>
              <th className="px-2 py-2 text-right font-medium">в т.ч. лизинг</th>
              <th className="px-2 py-2 text-right font-medium" title="Из расходов — переложено на арендаторов сверх аренды, не режет чистую прибыль">
                в т.ч. на аренд.
              </th>
              <th className="px-2 py-2 text-right font-medium">Налог</th>
              <th className="px-2 py-2 text-right font-medium">Чистый поток</th>
              <th className="px-2 py-2 text-right font-medium">Накопленно</th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <YearRow key={y.year} year={y} limit={model.params.revenueLimitByn} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function YearRow({ year, limit }: { year: FinYear; limit: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="cursor-pointer border-b border-border hover:bg-surface-muted/50" onClick={() => setExpanded((v) => !v)}>
        <td className="px-2 py-2 font-semibold text-ink">
          <span className="flex items-center gap-1">
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-ink-faint" /> : <ChevronRight className="h-3.5 w-3.5 text-ink-faint" />}
            {year.year}
            {year.limitExceeded && (
              <span
                className="flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning"
                title={`Выручка за год превышает лимит ИП ${formatByn(limit)} — переход в юрлицо, 30% со всего дохода`}
              >
                <TriangleAlert className="h-3 w-3" /> лимит ИП
              </span>
            )}
          </span>
        </td>
        <td className="px-2 py-2 text-right text-ink"><Byn value={year.income} /></td>
        <td className="px-2 py-2 text-right text-ink"><Byn value={year.expense} /></td>
        <td className="px-2 py-2 text-right text-ink-muted"><Byn value={year.leasing} /></td>
        <td className="px-2 py-2 text-right text-primary"><Byn value={year.reimbursedExpense} /></td>
        <td
          className="px-2 py-2 text-right text-ink"
          title={`От оборота: ${formatByn(year.taxRevenueVariant)} · От прибыли: ${formatByn(year.taxProfitVariant)}`}
        >
          <Byn value={year.tax} />
          <span className="ml-1 text-[11px] text-ink-faint">{year.taxRegime === 'profit' ? 'от прибыли' : 'от оборота'}</span>
        </td>
        <td className={cn('px-2 py-2 text-right font-semibold', year.net >= 0 ? 'text-success' : 'text-danger')}><Byn value={year.net} /></td>
        <td className={cn('px-2 py-2 text-right font-semibold', year.cumulativeEnd >= 0 ? 'text-ink' : 'text-danger')}>
          <Byn value={year.cumulativeEnd} />
        </td>
      </tr>
      {expanded &&
        year.months.map((m) => (
          <tr key={m.index} className="border-b border-border/50 text-xs text-ink-muted">
            <td className="px-2 py-1.5 pl-7">{m.label}</td>
            <td className="px-2 py-1.5 text-right"><Byn value={m.income} /></td>
            <td className="px-2 py-1.5 text-right"><Byn value={m.expense} /></td>
            <td className="px-2 py-1.5 text-right"><Byn value={m.leasing} /></td>
            <td className="px-2 py-1.5 text-right text-primary"><Byn value={m.reimbursedExpense} /></td>
            <td className="px-2 py-1.5 text-right"><Byn value={m.tax} /></td>
            <td className={cn('px-2 py-1.5 text-right', m.net >= 0 ? 'text-success' : 'text-danger')}><Byn value={m.net} /></td>
            <td className={cn('px-2 py-1.5 text-right', m.cumulative >= 0 ? '' : 'text-danger')}><Byn value={m.cumulative} /></td>
          </tr>
        ))}
    </>
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
