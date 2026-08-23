import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ExternalLink, Loader2, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { SearchInput } from '../components/ui/SearchInput';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import {
  fetchMarketOffers,
  setMarketOfferFinishStatus,
  setMarketOfferReviewed,
  updateMarketOffer,
  deleteMarketOffer,
} from '../lib/marketOffersApi';
import { FINISH_STATUSES, MARKET_PROPERTY_TYPES, areaBucket } from '../data/marketOffers';
import type { MarketOffer, FinishStatus } from '../data/marketOffers';

// Ручная верификация объявлений с Kufar (и позже Realt): владелец сам
// проставляет статус отделки (у большинства объявлений его нет в исходных
// данных, см. SEO_PLAN.md) и правит остальные поля, если Kufar отдал их
// неверно. Это ЖИВОЙ источник для таблицы на /rayon-minsk-mir — правки
// здесь видны там сразу, без пересинка (DistrictGuidePage.tsx считает
// медиану прямо из этих же строк).
//
// Два независимых статуса на строке:
// - "Отделка" (finishStatus) — сами данные: с отделкой / без отделки / не
//   указано.
// - "Обработано" (reviewed) — статус РАБОТЫ владельца над строкой: смотрел
//   ли он её вообще. Можно поставить "Проверено", даже не трогая отделку
//   (например, свериться по ссылке и убедиться, что "не указано" — и есть
//   правда). Reviewed=true заодно защищает всю строку от перезаписи при
//   следующем месячном синке (см. scripts/sync-kufar-market-offers.mjs).

const FINISH_FILTER_OPTIONS = ['Все', 'Не указано', 'С отделкой', 'Без отделки'] as const;
type FinishFilter = (typeof FINISH_FILTER_OPTIONS)[number];

const FINISH_FILTER_TO_DB: Record<FinishFilter, FinishStatus | null> = {
  Все: null,
  'Не указано': 'не указано',
  'С отделкой': 'с отделкой',
  'Без отделки': 'без отделки',
};

const DEAL_FILTER_OPTIONS = ['Все', 'Продажа', 'Аренда'] as const;
type DealFilter = (typeof DEAL_FILTER_OPTIONS)[number];

const REVIEW_FILTER_OPTIONS = ['Все', 'Не обработано', 'Проверено'] as const;
type ReviewFilter = (typeof REVIEW_FILTER_OPTIONS)[number];

const FINISH_PILL_LABEL: Record<FinishStatus, string> = {
  'с отделкой': 'С отделкой',
  'без отделки': 'Без отделки',
  'не указано': 'Не указано',
};

function FinishStatusPicker({
  value,
  onChange,
}: {
  value: FinishStatus;
  onChange: (status: FinishStatus) => void;
}) {
  return (
    <div className="flex gap-1">
      {FINISH_STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onChange(status)}
          className={cn(
            'whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium transition-colors',
            value === status ? 'bg-ink/80 text-white' : 'bg-surface-muted text-ink-muted hover:bg-border',
          )}
        >
          {FINISH_PILL_LABEL[status]}
        </button>
      ))}
    </div>
  );
}

function ReviewedPicker({ value, onChange }: { value: boolean; onChange: (reviewed: boolean) => void }) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
          !value ? 'bg-warning-bg text-warning' : 'bg-surface-muted text-ink-muted hover:bg-border',
        )}
      >
        Не обработано
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
          value ? 'bg-success-bg text-success' : 'bg-surface-muted text-ink-muted hover:bg-border',
        )}
      >
        Проверено
      </button>
    </div>
  );
}

interface EditFormState {
  dealType: 'sale' | 'rent';
  propertyType: string;
  size: string;
  pricePerSqm: string;
  finishStatus: FinishStatus;
  address: string;
}

function offerToForm(offer: MarketOffer): EditFormState {
  return {
    dealType: offer.dealType,
    propertyType: offer.propertyType,
    size: String(offer.size),
    pricePerSqm: String(offer.pricePerSqm),
    finishStatus: offer.finishStatus as FinishStatus,
    address: offer.address ?? '',
  };
}

export function MarketOffersReview() {
  const [offers, setOffers] = useState<MarketOffer[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [finishFilter, setFinishFilter] = useState<FinishFilter>('Все');
  const [dealFilter, setDealFilter] = useState<DealFilter>('Все');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('Не обработано');
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [editingOffer, setEditingOffer] = useState<MarketOffer | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMarketOffers()
      .then(setOffers)
      .catch(() => setError('Не удалось загрузить объявления.'));
  }, []);

  const counts = useMemo(() => {
    if (!offers) return null;
    return {
      total: offers.length,
      finished: offers.filter((o) => o.finishStatus === 'с отделкой').length,
      unfinished: offers.filter((o) => o.finishStatus === 'без отделки').length,
      unknown: offers.filter((o) => o.finishStatus === 'не указано').length,
      reviewed: offers.filter((o) => o.reviewed).length,
    };
  }, [offers]);

  const filtered = useMemo(() => {
    if (!offers) return [];
    const query = search.trim().toLowerCase();
    return offers
      .filter((o) => {
        const wantedFinish = FINISH_FILTER_TO_DB[finishFilter];
        if (wantedFinish && o.finishStatus !== wantedFinish) return false;
        if (dealFilter === 'Продажа' && o.dealType !== 'sale') return false;
        if (dealFilter === 'Аренда' && o.dealType !== 'rent') return false;
        if (reviewFilter === 'Не обработано' && o.reviewed) return false;
        if (reviewFilter === 'Проверено' && !o.reviewed) return false;
        if (query && !(o.address ?? '').toLowerCase().includes(query) && !o.propertyType.toLowerCase().includes(query)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.size - b.size);
  }, [offers, search, finishFilter, dealFilter, reviewFilter]);

  function patchOffer(id: number, patch: Partial<MarketOffer>) {
    setOffers((prev) => (prev ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  async function handleFinishChange(offer: MarketOffer, status: FinishStatus) {
    setPendingId(offer.id);
    try {
      await setMarketOfferFinishStatus(offer.id, status);
      patchOffer(offer.id, { finishStatus: status, reviewed: true });
    } catch {
      setError('Не удалось сохранить статус — попробуйте ещё раз.');
    } finally {
      setPendingId(null);
    }
  }

  async function handleReviewedChange(offer: MarketOffer, reviewed: boolean) {
    setPendingId(offer.id);
    try {
      await setMarketOfferReviewed(offer.id, reviewed);
      patchOffer(offer.id, { reviewed });
    } catch {
      setError('Не удалось сохранить статус — попробуйте ещё раз.');
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(offer: MarketOffer) {
    setPendingId(offer.id);
    try {
      await deleteMarketOffer(offer.id);
      setOffers((prev) => (prev ?? []).filter((o) => o.id !== offer.id));
    } catch {
      setError('Не удалось удалить объявление — попробуйте ещё раз.');
    } finally {
      setPendingId(null);
    }
  }

  function openEdit(offer: MarketOffer) {
    setEditingOffer(offer);
    setEditForm(offerToForm(offer));
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editingOffer || !editForm) return;
    const size = Number(editForm.size.replace(',', '.'));
    const pricePerSqm = Number(editForm.pricePerSqm.replace(',', '.'));
    if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(pricePerSqm) || pricePerSqm <= 0) {
      setError('Площадь и цена должны быть положительными числами.');
      return;
    }
    setSaving(true);
    try {
      const patch = {
        dealType: editForm.dealType,
        propertyType: editForm.propertyType,
        size,
        pricePerSqm,
        finishStatus: editForm.finishStatus,
        address: editForm.address,
      };
      await updateMarketOffer(editingOffer.id, patch);
      patchOffer(editingOffer.id, { ...patch, address: editForm.address || null, reviewed: true });
      setEditingOffer(null);
      setEditForm(null);
    } catch {
      setError('Не удалось сохранить изменения — попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Рынок недвижимости" />

      {error && <p className="text-sm text-danger">{error}</p>}

      {offers === null && !error && (
        <div className="flex items-center gap-2 text-sm text-ink-faint">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {offers !== null && (
        <div className="flex flex-col gap-4">
          {counts && (
            <p className="text-sm text-ink-muted">
              Всего {counts.total} объявлений (Kufar) · с отделкой {counts.finished} · без отделки {counts.unfinished} ·
              не указано {counts.unknown} · обработано {counts.reviewed} из {counts.total}
            </p>
          )}

          <div className={cn('flex flex-col gap-3 p-4', glassCardClass)} style={glassCardShadow}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SearchInput
                placeholder="Поиск по адресу или типу…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:max-w-xs"
              />
              <div className="flex flex-wrap gap-3">
                <ToggleGroup
                  label="Обработка"
                  options={[...REVIEW_FILTER_OPTIONS]}
                  value={reviewFilter}
                  onChange={(v) => setReviewFilter(v as ReviewFilter)}
                />
                <ToggleGroup label="Сделка" options={[...DEAL_FILTER_OPTIONS]} value={dealFilter} onChange={(v) => setDealFilter(v as DealFilter)} />
                <ToggleGroup
                  label="Отделка"
                  options={[...FINISH_FILTER_OPTIONS]}
                  value={finishFilter}
                  onChange={(v) => setFinishFilter(v as FinishFilter)}
                />
              </div>
            </div>
            <p className="text-xs text-ink-faint">
              Правки сразу учитываются в таблице на /rayon-minsk-mir и не перезатираются автоматическим синком.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  <th className="py-2 pr-3">Адрес</th>
                  <th className="py-2 px-2">Тип</th>
                  <th className="py-2 px-2">Сделка</th>
                  <th className="py-2 px-2 text-right">Площадь</th>
                  <th className="py-2 px-2 text-right">Цена / м²</th>
                  <th className="py-2 px-2">Отделка</th>
                  <th className="py-2 px-2">Обработка</th>
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((offer) => (
                  <tr key={offer.id} className={pendingId === offer.id ? 'opacity-50' : undefined}>
                    <td className="max-w-[200px] py-2.5 pr-3">
                      {offer.adLink ? (
                        <a
                          href={offer.adLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-ink hover:underline"
                        >
                          <span className="truncate">{offer.address ?? '—'}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-ink-faint" />
                        </a>
                      ) : (
                        (offer.address ?? '—')
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-ink-muted">{offer.propertyType}</td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-ink-muted">{offer.dealType === 'sale' ? 'Продажа' : 'Аренда'}</td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right tabular-nums text-ink-muted">
                      {offer.size} м² <span className="text-ink-faint">({areaBucket(offer.size)})</span>
                    </td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right tabular-nums text-ink-muted">
                      {offer.pricePerSqm} $/м²{offer.dealType === 'rent' ? '/мес' : ''}
                    </td>
                    <td className="whitespace-nowrap py-2.5 px-2">
                      <FinishStatusPicker
                        value={offer.finishStatus as FinishStatus}
                        onChange={(status) => handleFinishChange(offer, status)}
                      />
                    </td>
                    <td className="whitespace-nowrap py-2.5 px-2">
                      <ReviewedPicker value={offer.reviewed} onChange={(reviewed) => handleReviewedChange(offer, reviewed)} />
                    </td>
                    <td className="whitespace-nowrap py-2.5 pl-2">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => openEdit(offer)}
                          aria-label="Редактировать объявление"
                          className="text-ink-faint hover:text-primary"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(offer)}
                          aria-label="Удалить объявление"
                          className="text-ink-faint hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="py-6 text-center text-sm text-ink-faint">Ничего не найдено.</p>}
          </div>
        </div>
      )}

      <Modal open={!!editingOffer} onClose={() => setEditingOffer(null)} title="Редактировать объявление">
        {editForm && (
          <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
            <Select
              label="Тип помещения"
              options={MARKET_PROPERTY_TYPES}
              value={editForm.propertyType}
              onChange={(v) => setEditForm((f) => f && { ...f, propertyType: v })}
            />
            <div>
              <span className="mb-1.5 block text-sm text-ink-muted">Сделка</span>
              <ToggleGroup
                options={['Продажа', 'Аренда']}
                value={editForm.dealType === 'sale' ? 'Продажа' : 'Аренда'}
                onChange={(v) => setEditForm((f) => f && { ...f, dealType: v === 'Продажа' ? 'sale' : 'rent' })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Площадь, м²"
                type="text"
                inputMode="decimal"
                value={editForm.size}
                onChange={(e) => setEditForm((f) => f && { ...f, size: e.target.value })}
              />
              <Input
                label={`Цена за м²${editForm.dealType === 'rent' ? '/мес' : ''}, $`}
                type="text"
                inputMode="decimal"
                value={editForm.pricePerSqm}
                onChange={(e) => setEditForm((f) => f && { ...f, pricePerSqm: e.target.value })}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-sm text-ink-muted">Отделка</span>
              <FinishStatusPicker
                value={editForm.finishStatus}
                onChange={(status) => setEditForm((f) => f && { ...f, finishStatus: status })}
              />
            </div>
            <Input
              label="Адрес"
              value={editForm.address}
              onChange={(e) => setEditForm((f) => f && { ...f, address: e.target.value })}
            />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setEditingOffer(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
