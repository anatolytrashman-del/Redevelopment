import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Check } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { EstimateLineItemsTable, formatUsd, formatZone } from '../components/estimates/EstimateLineItemsTable';
import { EstimateLineItemFormModal } from '../components/estimates/EstimateLineItemFormModal';
import { EstimateLineItemCommentsModal } from '../components/estimates/EstimateLineItemCommentsModal';
import { EstimateMaterialsPanel } from '../components/estimates/EstimateMaterialsPanel';
import { EstimateMaterialFormModal } from '../components/estimates/EstimateMaterialFormModal';
import { cn } from '../lib/cn';
import {
  estimateLineItemsTotals,
  sectionLineItemsTotals,
  type Estimate,
  type EstimateLineItem,
  type EstimateMaterial,
} from '../data/estimates';
import type { DocumentFile } from '../data/contractorDocuments';
import type { RealtyObject } from '../data/objects';
import type { ExchangeRate } from '../data/exchangeRates';
import { fetchEstimateByToken, updateEstimate } from '../lib/estimatesApi';
import { fetchObject } from '../lib/objectsApi';
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
// админки. Показывает и позволяет редактировать построчную смету и список
// материалов/снабжение каждого раздела (EstimateLineItemsTable/
// EstimateMaterialsPanel и их модалки переиспользованы как есть из
// EstimateDetail.tsx, у них нет своей зависимости от PasswordGate/профиля).
// Текст разделов, позиции-ТЗ и открытые вопросы (внутренняя переписка
// команды) сюда сознательно не попадают. Владелец, 2026-08-27: держать эту
// страницу в паритете со страницей внутри админки по всем правкам построчной
// сметы — "Можно сделать позже" на уровне раздела и карточку "Второй этаж"
// сюда тоже перенести (раньше были только в EstimateDetail.tsx).
export function EstimatePublicPage() {
  const { token } = useParams();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [object, setObject] = useState<RealtyObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rate, setRate] = useState<ExchangeRate | null>(null);

  const [lineItemModalOpen, setLineItemModalOpen] = useState(false);
  const [lineItemSectionId, setLineItemSectionId] = useState<string | null>(null);
  const [editingLineItem, setEditingLineItem] = useState<EstimateLineItem | null>(null);

  const [commentsSectionId, setCommentsSectionId] = useState<string | null>(null);
  const [commentsLineItem, setCommentsLineItem] = useState<EstimateLineItem | null>(null);

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialSectionId, setMaterialSectionId] = useState<string | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<EstimateMaterial | null>(null);

  // Заголовок вкладки браузера — по умолчанию общий (ESTIMATE_PUBLIC_TITLE,
  // пока объект ещё не загрузился), затем "Смета реновации <адрес/название
  // объекта>" (владелец, 2026-08-27). Восстановление исходного заголовка
  // страницы — отдельным эффектом с []-зависимостями, чтобы захватить и
  // вернуть именно тот заголовок, что был ДО монтирования этой страницы, а
  // не промежуточное значение с предыдущего рендера этого же эффекта.
  useEffect(() => {
    const previousTitle = document.title;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    document.title = object ? `Смета реновации ${object.name || object.address}` : ESTIMATE_PUBLIC_TITLE;
  }, [object]);

  useEffect(() => {
    setNoIndex();
    return () => clearNoIndex();
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    fetchEstimateByToken(token)
      .then((e) => {
        setEstimate(e);
        return fetchObject(e.objectId);
      })
      .then(setObject)
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

  async function toggleLineItemDeferred(sectionId: string, item: EstimateLineItem) {
    if (!estimate) return;
    const sections = estimate.sections.map((s) =>
      s.id === sectionId
        ? { ...s, lineItems: s.lineItems.map((li) => (li.id === item.id ? { ...li, deferred: !li.deferred } : li)) }
        : s,
    );
    try {
      await savePatch(sections);
    } catch (err) {
      setLoadError(errorMessage(err, 'Не удалось изменить отметку'));
    }
  }

  async function toggleSectionDeferred(sectionId: string) {
    if (!estimate) return;
    const sections = estimate.sections.map((s) => (s.id === sectionId ? { ...s, deferred: !s.deferred } : s));
    try {
      await savePatch(sections);
    } catch (err) {
      setLoadError(errorMessage(err, 'Не удалось изменить отметку'));
    }
  }

  function openAddMaterial(sectionId: string) {
    setMaterialSectionId(sectionId);
    setEditingMaterial(null);
    setMaterialModalOpen(true);
  }

  function openEditMaterial(sectionId: string, material: EstimateMaterial) {
    setMaterialSectionId(sectionId);
    setEditingMaterial(material);
    setMaterialModalOpen(true);
  }

  async function saveMaterial(saved: EstimateMaterial) {
    if (!estimate || !materialSectionId) return;
    const sections = estimate.sections.map((s) => {
      if (s.id !== materialSectionId) return s;
      const exists = s.materials.some((m) => m.id === saved.id);
      return { ...s, materials: exists ? s.materials.map((m) => (m.id === saved.id ? saved : m)) : [...s.materials, saved] };
    });
    await savePatch(sections);
  }

  async function deleteMaterial(sectionId: string, materialId: string) {
    if (!estimate) return;
    if (!window.confirm('Удалить материал?')) return;
    const sections = estimate.sections.map((s) =>
      s.id === sectionId ? { ...s, materials: s.materials.filter((m) => m.id !== materialId) } : s,
    );
    try {
      await savePatch(sections);
    } catch (err) {
      setLoadError(errorMessage(err, 'Не удалось удалить материал'));
    }
  }

  async function saveMaterialFiles(sectionId: string, files: DocumentFile[]) {
    if (!estimate) return;
    const sections = estimate.sections.map((s) => (s.id === sectionId ? { ...s, materialFiles: files } : s));
    await savePatch(sections);
  }

  async function saveMaterialListFiles(sectionId: string, files: DocumentFile[]) {
    if (!estimate) return;
    const sections = estimate.sections.map((s) => (s.id === sectionId ? { ...s, materialListFiles: files } : s));
    await savePatch(sections);
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

  const totals = estimateLineItemsTotals(estimate, rate);
  const grandTotal = totals.now.total + totals.later.total;

  // "Второй этаж" — та же оценка, что и в EstimateDetail.tsx (см. её же
  // комментарий): сумма всех разделов кроме "Фасад" зеркалится как оценка
  // 2-го этажа.
  const floor1Total = estimate.sections
    .filter((s) => s.title.trim() !== 'Фасад')
    .reduce((sum, s) => {
      const t = sectionLineItemsTotals(s, rate);
      return sum + t.now.total + t.later.total;
    }, 0);
  const floor2Estimate = floor1Total;
  const grandTotalWithFloor2 = grandTotal + floor2Estimate;

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

        {grandTotal > 0 && (
          <Card className="flex flex-col gap-1 p-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-bold text-ink">Сейчас</span>
              <span className="font-semibold text-ink">{formatBynUsd(totals.now.total, rate)}</span>
            </div>
            {totals.later.total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-ink-muted">
                <span>Можно позже</span>
                <span>{formatBynUsd(totals.later.total, rate)}</span>
              </div>
            )}
          </Card>
        )}

        {floor1Total > 0 && (
          <Card className="flex flex-col gap-3 p-5">
            <span className="font-bold text-ink">Второй этаж</span>
            <p className="text-sm text-ink-faint">
              Расчёт только по 1-му этажу — 2-й пока условно считаем той же суммой, что 1-й этаж и общие зоны вместе
              (без фасада — фасадные работы не дублируются по этажам).
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">1-й этаж + общие зоны (без фасада)</div>
                <div className="text-sm font-semibold text-ink">{formatBynUsd(floor1Total, rate)}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">2-й этаж (оценочно, столько же)</div>
                <div className="text-sm font-semibold text-ink">{formatBynUsd(floor2Estimate, rate)}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Итого по смете с учётом 2-го этажа</div>
                <div className="text-sm font-semibold text-ink">{formatBynUsd(grandTotalWithFloor2, rate)}</div>
              </div>
            </div>
          </Card>
        )}

        {estimate.sections.map((section) => (
          <Card key={section.id} className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="font-bold text-ink">{formatZone(section.title)}</div>
              <button
                type="button"
                onClick={() => toggleSectionDeferred(section.id)}
                className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-muted"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded border',
                    section.deferred ? 'border-primary bg-primary text-white' : 'border-border text-transparent',
                  )}
                >
                  <Check className="h-3 w-3" />
                </span>
                Можно сделать позже
              </button>
            </div>
            <EstimateLineItemsTable
              section={section}
              rate={rate}
              onAdd={() => openAddLineItem(section.id)}
              onEdit={(item) => openEditLineItem(section.id, item)}
              onDelete={(item) => deleteLineItem(section.id, item.id)}
              onOpenComments={(item) => openLineItemComments(section.id, item)}
              onToggleDeferred={(item) => toggleLineItemDeferred(section.id, item)}
            />
            <div className="border-t border-border pt-4">
              <EstimateMaterialsPanel
                section={section}
                onAdd={() => openAddMaterial(section.id)}
                onEdit={(m) => openEditMaterial(section.id, m)}
                onDelete={(m) => deleteMaterial(section.id, m.id)}
                onFilesChange={(files) => saveMaterialFiles(section.id, files)}
                onListFilesChange={(files) => saveMaterialListFiles(section.id, files)}
              />
            </div>
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

      <EstimateMaterialFormModal
        open={materialModalOpen}
        material={editingMaterial}
        onClose={() => setMaterialModalOpen(false)}
        onSaved={saveMaterial}
      />
    </div>
  );
}
