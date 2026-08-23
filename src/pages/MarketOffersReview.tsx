import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy, ExternalLink, Loader2, Pencil, Trash2 } from 'lucide-react';
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
  fetchDismissedDedupKeys,
  dismissDuplicateGroup,
} from '../lib/marketOffersApi';
import { FINISH_STATUSES, MARKET_PROPERTY_TYPES, areaBucket, dedupKey, netSize, netPricePerSqm } from '../data/marketOffers';
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

const SOURCE_FILTER_OPTIONS = ['Все', 'Kufar', 'Realt'] as const;
type SourceFilter = (typeof SOURCE_FILTER_OPTIONS)[number];

const DUP_FILTER_OPTIONS = ['Все', 'Только дубли'] as const;
type DupFilter = (typeof DUP_FILTER_OPTIONS)[number];

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
  floor: string;
  hasTerrace: boolean;
  terraceArea: string;
  address: string;
}

function offerToForm(offer: MarketOffer): EditFormState {
  return {
    dealType: offer.dealType,
    propertyType: offer.propertyType,
    size: String(offer.size),
    pricePerSqm: String(offer.pricePerSqm),
    finishStatus: offer.finishStatus as FinishStatus,
    floor: offer.floor == null ? '' : String(offer.floor),
    hasTerrace: offer.hasTerrace,
    terraceArea: offer.terraceArea == null ? '' : String(offer.terraceArea),
    address: offer.address ?? '',
  };
}

// Одна строка объявления — переиспользуется и в обычной таблице, и внутри
// карточек групп дублей (там сравнение построено вокруг компактной
// мини-таблицы на каждую группу, чтобы Kufar/Realt-варианты одного
// помещения были видны рядом).
function OfferRow({
  offer,
  pending,
  showDuplicateBadge,
  onFinishChange,
  onReviewedChange,
  onEdit,
  onDelete,
}: {
  offer: MarketOffer;
  pending: boolean;
  showDuplicateBadge: boolean;
  onFinishChange: (offer: MarketOffer, status: FinishStatus) => void;
  onReviewedChange: (offer: MarketOffer, reviewed: boolean) => void;
  onEdit: (offer: MarketOffer) => void;
  onDelete: (offer: MarketOffer) => void;
}) {
  return (
    <tr className={pending ? 'opacity-50' : undefined}>
      <td className="max-w-[200px] py-2.5 pr-3">
        <div className="flex items-center gap-1.5">
          {offer.adLink ? (
            <a
              href={offer.adLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 items-center gap-1 text-ink hover:underline"
            >
              <span className="truncate">{offer.address ?? '—'}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-ink-faint" />
            </a>
          ) : (
            <span className="truncate">{offer.address ?? '—'}</span>
          )}
          {showDuplicateBadge && (
            <span
              title="Похожее объявление есть ещё раз в базе — проверьте и удалите лишнее"
              className="flex shrink-0 items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning"
            >
              <Copy className="h-3 w-3" />
              дубль
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap py-2.5 px-2 text-ink-muted">{offer.source}</td>
      <td className="whitespace-nowrap py-2.5 px-2 text-ink-muted">{offer.propertyType}</td>
      <td className="whitespace-nowrap py-2.5 px-2 text-ink-muted">{offer.dealType === 'sale' ? 'Продажа' : 'Аренда'}</td>
      <td className="whitespace-nowrap py-2.5 px-2 text-right tabular-nums text-ink-muted">
        {offer.size} м² <span className="text-ink-faint">({areaBucket(netSize(offer))})</span>
        {offer.hasTerrace && (
          <div className="text-xs text-warning">терраса {offer.terraceArea ?? '?'} · чисто {netSize(offer)} м²</div>
        )}
      </td>
      <td className="whitespace-nowrap py-2.5 px-2 text-right tabular-nums text-ink-muted">{offer.floor ?? '—'}</td>
      <td className="whitespace-nowrap py-2.5 px-2 text-right tabular-nums text-ink-muted">
        {offer.pricePerSqm} $/м²{offer.dealType === 'rent' ? '/мес' : ''}
        {offer.hasTerrace && (
          <div className="text-xs text-warning">на чистую — {netPricePerSqm(offer)} $/м²</div>
        )}
      </td>
      <td className="whitespace-nowrap py-2.5 px-2">
        <FinishStatusPicker value={offer.finishStatus as FinishStatus} onChange={(status) => onFinishChange(offer, status)} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-2">
        <ReviewedPicker value={offer.reviewed} onChange={(reviewed) => onReviewedChange(offer, reviewed)} />
      </td>
      <td className="whitespace-nowrap py-2.5 pl-2">
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => onEdit(offer)} aria-label="Редактировать объявление" className="text-ink-faint hover:text-primary">
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onDelete(offer)} aria-label="Удалить объявление" className="text-ink-faint hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function OfferTableHead() {
  return (
    <thead>
      <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
        <th className="py-2 pr-3">Адрес</th>
        <th className="py-2 px-2">Источник</th>
        <th className="py-2 px-2">Тип</th>
        <th className="py-2 px-2">Сделка</th>
        <th className="py-2 px-2 text-right">Площадь</th>
        <th className="py-2 px-2 text-right">Этаж</th>
        <th className="py-2 px-2 text-right">Цена / м²</th>
        <th className="py-2 px-2">Отделка</th>
        <th className="py-2 px-2">Обработка</th>
        <th className="py-2 pl-2" />
      </tr>
    </thead>
  );
}

export function MarketOffersReview() {
  const [offers, setOffers] = useState<MarketOffer[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [finishFilter, setFinishFilter] = useState<FinishFilter>('Все');
  const [dealFilter, setDealFilter] = useState<DealFilter>('Все');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('Не обработано');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('Все');
  const [dupFilter, setDupFilter] = useState<DupFilter>('Все');
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [pendingGroupKey, setPendingGroupKey] = useState<string | null>(null);
  const [editingOffer, setEditingOffer] = useState<MarketOffer | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchMarketOffers()
      .then(setOffers)
      .catch(() => setError('Не удалось загрузить объявления.'));
    fetchDismissedDedupKeys()
      .then(setDismissedKeys)
      .catch(() => {}); // не критично — просто снова покажутся уже разобранные группы
  }, []);

  // Возможные дубли — один и тот же объект на разных площадках (или дважды
  // на одной), см. dedupKey в data/marketOffers.ts. Считаем по ВСЕМ
  // объявлениям, не по уже отфильтрованным — иначе включённые фильтры
  // (например, "Продажа") случайно спрятали бы вторую половину пары.
  // Группы, которые ассистент уже посмотрел и подтвердил как два разных
  // помещения (dismissedKeys), из подсчёта убираем — они разобраны.
  const duplicateGroups = useMemo(() => {
    if (!offers) return new Map<string, MarketOffer[]>();
    const groups = new Map<string, MarketOffer[]>();
    for (const offer of offers) {
      const key = dedupKey(offer);
      if (!key || dismissedKeys.has(key)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(offer);
    }
    for (const [key, group] of groups) {
      if (group.length < 2) groups.delete(key);
    }
    return groups;
  }, [offers, dismissedKeys]);

  const duplicateKeyByOfferId = useMemo(() => {
    const map = new Map<number, string>();
    for (const [key, group] of duplicateGroups) {
      for (const offer of group) map.set(offer.id, key);
    }
    return map;
  }, [duplicateGroups]);

  const counts = useMemo(() => {
    if (!offers) return null;
    return {
      total: offers.length,
      kufar: offers.filter((o) => o.source === 'Kufar').length,
      realt: offers.filter((o) => o.source === 'Realt').length,
      finished: offers.filter((o) => o.finishStatus === 'с отделкой').length,
      unfinished: offers.filter((o) => o.finishStatus === 'без отделки').length,
      unknown: offers.filter((o) => o.finishStatus === 'не указано').length,
      reviewed: offers.filter((o) => o.reviewed).length,
      duplicates: [...duplicateGroups.values()].reduce((sum, g) => sum + g.length, 0),
    };
  }, [offers, duplicateGroups]);

  // В режиме "Только дубли" таблица уступает место карточкам групп (ниже) —
  // там сравнение построено вокруг пары/тройки объявлений одного помещения,
  // а не построчного списка, поэтому остальные фильтры (отделка/сделка/
  // источник) в этом режиме не применяются — иначе легко спрятать половину
  // пары и потерять сравнение.
  const filtered = useMemo(() => {
    if (!offers || dupFilter === 'Только дубли') return [];
    const query = search.trim().toLowerCase();
    return offers
      .filter((o) => {
        const wantedFinish = FINISH_FILTER_TO_DB[finishFilter];
        if (wantedFinish && o.finishStatus !== wantedFinish) return false;
        if (dealFilter === 'Продажа' && o.dealType !== 'sale') return false;
        if (dealFilter === 'Аренда' && o.dealType !== 'rent') return false;
        if (reviewFilter === 'Не обработано' && o.reviewed) return false;
        if (reviewFilter === 'Проверено' && !o.reviewed) return false;
        if (sourceFilter !== 'Все' && o.source !== sourceFilter) return false;
        if (query && !(o.address ?? '').toLowerCase().includes(query) && !o.propertyType.toLowerCase().includes(query)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.size - b.size);
  }, [offers, search, finishFilter, dealFilter, reviewFilter, sourceFilter, dupFilter]);

  const duplicateGroupsList = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...duplicateGroups.entries()]
      .filter(([, group]) => !query || group.some((o) => (o.address ?? '').toLowerCase().includes(query)))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [duplicateGroups, search]);

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

  async function handleDismissGroup(key: string) {
    setPendingGroupKey(key);
    try {
      await dismissDuplicateGroup(key);
      setDismissedKeys((prev) => new Set(prev).add(key));
    } catch {
      setError('Не удалось сохранить — попробуйте ещё раз.');
    } finally {
      setPendingGroupKey(null);
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
    const floorTrimmed = editForm.floor.trim();
    const floor = floorTrimmed === '' ? null : Number(floorTrimmed);
    if (floor != null && !Number.isFinite(floor)) {
      setError('Этаж должен быть числом (или оставьте поле пустым).');
      return;
    }
    let terraceArea: number | null = null;
    if (editForm.hasTerrace) {
      terraceArea = Number(editForm.terraceArea.replace(',', '.'));
      if (!Number.isFinite(terraceArea) || terraceArea <= 0 || terraceArea >= size) {
        setError('Площадь террасы должна быть положительным числом меньше общей площади.');
        return;
      }
    }
    setSaving(true);
    try {
      const patch = {
        dealType: editForm.dealType,
        propertyType: editForm.propertyType,
        size,
        pricePerSqm,
        finishStatus: editForm.finishStatus,
        floor,
        hasTerrace: editForm.hasTerrace,
        terraceArea,
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
      <PageHeader title="Аналитика рынка" />

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
              Всего {counts.total} объявлений (Kufar {counts.kufar} · Realt {counts.realt}) · с отделкой{' '}
              {counts.finished} · без отделки {counts.unfinished} · не указано {counts.unknown} · обработано{' '}
              {counts.reviewed} из {counts.total}
              {counts.duplicates > 0 && (
                <>
                  {' '}
                  ·{' '}
                  <span className="font-semibold text-warning">возможных дублей — {counts.duplicates}</span>
                </>
              )}
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
                <ToggleGroup
                  label="Источник"
                  options={[...SOURCE_FILTER_OPTIONS]}
                  value={sourceFilter}
                  onChange={(v) => setSourceFilter(v as SourceFilter)}
                />
                <ToggleGroup label="Сделка" options={[...DEAL_FILTER_OPTIONS]} value={dealFilter} onChange={(v) => setDealFilter(v as DealFilter)} />
                <ToggleGroup
                  label="Отделка"
                  options={[...FINISH_FILTER_OPTIONS]}
                  value={finishFilter}
                  onChange={(v) => setFinishFilter(v as FinishFilter)}
                />
                <ToggleGroup label="Дубли" options={[...DUP_FILTER_OPTIONS]} value={dupFilter} onChange={(v) => setDupFilter(v as DupFilter)} />
              </div>
            </div>
            <p className="text-xs text-ink-faint">
              {dupFilter === 'Только дубли'
                ? 'Похожие объявления сгруппированы по адресу и площади — откройте ссылку, сверьте вручную и либо удалите лишнюю копию, либо подтвердите, что это разные помещения. Остальные фильтры здесь не действуют, чтобы не спрятать половину пары.'
                : 'Правки сразу учитываются в таблице на /rayon-minsk-mir и не перезатираются автоматическим синком.'}
            </p>
          </div>

          {dupFilter === 'Только дубли' ? (
            <div className="flex flex-col gap-4">
              {duplicateGroupsList.map(([key, group]) => (
                <div key={key} className={cn('flex flex-col gap-3 p-4', glassCardClass)} style={glassCardShadow}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-ink-muted">
                      <span className="font-semibold text-ink">{group[0].address ?? 'без адреса'}</span> ·{' '}
                      {group[0].size} м² · этаж {group[0].floor ?? '?'} · {group.length} объявления похожи друг на
                      друга
                    </p>
                    <Button
                      variant="secondary"
                      icon={<Check className="h-4 w-4" />}
                      disabled={pendingGroupKey === key}
                      onClick={() => handleDismissGroup(key)}
                    >
                      Это разные помещения
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1020px] border-collapse text-sm">
                      <OfferTableHead />
                      <tbody className="divide-y divide-border">
                        {group.map((offer) => (
                          <OfferRow
                            key={offer.id}
                            offer={offer}
                            pending={pendingId === offer.id}
                            showDuplicateBadge={false}
                            onFinishChange={handleFinishChange}
                            onReviewedChange={handleReviewedChange}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {duplicateGroupsList.length === 0 && (
                <p className="py-6 text-center text-sm text-ink-faint">Дублей не найдено.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1140px] border-collapse text-sm">
                <OfferTableHead />
                <tbody className="divide-y divide-border">
                  {filtered.map((offer) => (
                    <OfferRow
                      key={offer.id}
                      offer={offer}
                      pending={pendingId === offer.id}
                      showDuplicateBadge={duplicateKeyByOfferId.has(offer.id)}
                      onFinishChange={handleFinishChange}
                      onReviewedChange={handleReviewedChange}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <p className="py-6 text-center text-sm text-ink-faint">Ничего не найдено.</p>}
            </div>
          )}
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
            <Input
              label="Этаж (не обязательно)"
              type="text"
              inputMode="numeric"
              value={editForm.floor}
              onChange={(e) => setEditForm((f) => f && { ...f, floor: e.target.value })}
            />
            <div className="flex flex-col gap-3 rounded-control bg-surface-muted p-3">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={editForm.hasTerrace}
                  onChange={(e) => setEditForm((f) => f && { ...f, hasTerrace: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                Помещение с террасой
              </label>
              {editForm.hasTerrace && (
                <>
                  <p className="text-xs text-ink-faint">
                    Терраса стоит дешевле закрытого помещения и занижает цену за м² в сводке — считаем цену на
                    чистую площадь.
                  </p>
                  <Input
                    label="Терраса, м²"
                    type="text"
                    inputMode="decimal"
                    value={editForm.terraceArea}
                    onChange={(e) => setEditForm((f) => f && { ...f, terraceArea: e.target.value })}
                  />
                  <p className="text-sm text-ink-muted">
                    Чистая площадь:{' '}
                    <span className="font-semibold text-ink">
                      {(() => {
                        const total = Number(editForm.size.replace(',', '.'));
                        const terrace = Number(editForm.terraceArea.replace(',', '.'));
                        if (!Number.isFinite(total) || !Number.isFinite(terrace) || terrace <= 0) return '—';
                        const net = total - terrace;
                        return net > 0 ? `${Math.round(net * 100) / 100} м²` : '—';
                      })()}
                    </span>
                  </p>
                </>
              )}
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
