import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { EstimateLineItemsTable, formatUsd } from '../components/estimates/EstimateLineItemsTable';
import { EstimateLineItemFormModal } from '../components/estimates/EstimateLineItemFormModal';
import { EstimateLineItemCommentsModal } from '../components/estimates/EstimateLineItemCommentsModal';
import { estimateLineItemsTotals, type Estimate, type EstimateLineItem } from '../data/estimates';
import type { ExchangeRate } from '../data/exchangeRates';
import { fetchEstimateByToken, updateEstimate } from '../lib/estimatesApi';
import { fetchTodayRateOrLatestCached } from '../lib/exchangeRatesApi';
import { setNoIndex, clearNoIndex } from '../lib/pageMeta';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatMoney(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function formatBynUsd(value: number, rate: ExchangeRate | null): string {
  const usd = formatUsd(value, rate);
  return usd ? `${formatMoney(value)} Br · ${usd}` : `${formatMoney(value)} Br`;
}

const ESTIMATE_PUBLIC_TITLE = 'Построчная смета';

// Публичная ссылка для строителя (Артём и т.п.) — по shareToken, без пароля
// админки. Показывает и позволяет редактировать ТОЛЬКО построчную смету
// каждого раздела (EstimateLineItemsTable/FormModal/CommentsModal —
// переиспользованы как есть из EstimateDetail.tsx, у них нет своей
// зависимости от PasswordGate/профиля). Текст разделов, позиции-ТЗ,
// список материалов и открытые вопросы — внутренняя часть, сюда
// сознательно не попадают: подрядчику нужна только таблица цен.
export function EstimatePublicPage() {
  const { token } = useParams();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rate, setRate] = useState<ExchangeRate | null>(null);

  const [lineItemModalOpen, setLineItemModalOpen] = useState(false);
  const [lineItemSectionId, setLineItemSectionId] = useState<string | null>(null);
  const [editingLineItem, setEditingLineItem] = useState<EstimateLineItem | null>(null);

  const [commentsSectionId, setCommentsSectionId] = useState<string | null>(null);
  const [commentsLineItem, setCommentsLineItem] = useState<EstimateLineItem | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = ESTIMATE_PUBLIC_TITLE;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    setNoIndex();
    return () => clearNoIndex();
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    fetchEstimateByToken(token)
      .then(setEstimate)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить смету')))
      .finally(() => setLoading(false));
    fetchTodayRateOrLatestCached()
      .then(setRate)
      .catch(() => {});
  }, [token]);

  async function savePatch(sections: Estimate['sections']) {
    if (!estimate) throw new Error('Смета не загружена');
    const updated = await updateEstimate(estimate.id, { sections, questions: estimate.questions, status: estimate.status });
    setEstimate(updated);
    return updated;
  }

  function openAddLineItem(sectionId: string) {
    setLineItemSectionId(sectionId);
    setEditingLineItem(null);
    setLineItemModalOpen(true);
  }

  function openEditLineItem(sectionId: string, item: EstimateLineItem) {
    setLineItemSectionId(sectionId);
    setEditingLineItem(item);
    setLineItemModalOpen(true);
  }

  async function saveLineItem(saved: EstimateLineItem) {
    if (!estimate || !lineItemSectionId) return;
    const sections = estimate.sections.map((s) => {
      if (s.id !== lineItemSectionId) return s;
      const exists = s.lineItems.some((li) => li.id === saved.id);
      return {
        ...s,
        lineItems: exists ? s.lineItems.map((li) => (li.id === saved.id ? saved : li)) : [...s.lineItems, saved],
      };
    });
    await savePatch(sections);
  }

  async function deleteLineItem(sectionId: string, itemId: string) {
    if (!estimate) return;
    if (!window.confirm('Удалить строку сметы?')) return;
    const sections = estimate.sections.map((s) =>
      s.id === sectionId ? { ...s, lineItems: s.lineItems.filter((li) => li.id !== itemId) } : s,
    );
    try {
      await savePatch(sections);
    } catch (err) {
      setLoadError(errorMessage(err, 'Не удалось удалить строку'));
    }
  }

  function openLineItemComments(sectionId: string, item: EstimateLineItem) {
    setCommentsSectionId(sectionId);
    setCommentsLineItem(item);
  }

  async function saveLineItemComments(updated: EstimateLineItem) {
    if (!estimate || !commentsSectionId) return;
    const sections = estimate.sections.map((s) =>
      s.id === commentsSectionId ? { ...s, lineItems: s.lineItems.map((li) => (li.id === updated.id ? updated : li)) } : s,
    );
    const saved = await savePatch(sections);
    const savedSection = saved.sections.find((s) => s.id === commentsSectionId);
    setCommentsLineItem(savedSection?.lineItems.find((li) => li.id === updated.id) ?? null);
  }

  if (loading || loadError || !estimate) {
    return (
      <div className="min-h-svh bg-bg px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          <div>
            <span className="text-lg font-extrabold tracking-wide text-ink">
              <span className="font-black text-primary">RED</span>EVELOPMENT
            </span>
          </div>
          {loading && (
            <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем смету...
            </Card>
          )}
          {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
        </div>
      </div>
    );
  }

  const totals = estimateLineItemsTotals(estimate);

  return (
    <div className="min-h-svh bg-bg px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div>
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
        </div>

        <Card className="flex flex-col gap-1 p-5">
          <span className="text-lg font-bold text-ink">Построчная смета</span>
          <span className="text-sm text-ink-muted">Можно добавлять, редактировать и удалять строки, оставлять комментарии.</span>
        </Card>

        {totals.total > 0 && (
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5 text-sm">
            <span className="font-bold text-ink">Итого по смете</span>
            <span className="font-semibold text-ink">{formatBynUsd(totals.total, rate)}</span>
          </Card>
        )}

        {estimate.sections.map((section) => (
          <Card key={section.id} className="flex flex-col gap-3 p-5">
            <div className="font-bold text-ink">{section.title}</div>
            <EstimateLineItemsTable
              section={section}
              rate={rate}
              onAdd={() => openAddLineItem(section.id)}
              onEdit={(item) => openEditLineItem(section.id, item)}
              onDelete={(item) => deleteLineItem(section.id, item.id)}
              onOpenComments={(item) => openLineItemComments(section.id, item)}
            />
          </Card>
        ))}
      </div>

      <EstimateLineItemFormModal
        open={lineItemModalOpen}
        item={editingLineItem}
        onClose={() => setLineItemModalOpen(false)}
        onSaved={saveLineItem}
      />

      <EstimateLineItemCommentsModal
        item={commentsLineItem}
        onClose={() => {
          setCommentsSectionId(null);
          setCommentsLineItem(null);
        }}
        onSave={saveLineItemComments}
      />
    </div>
  );
}
