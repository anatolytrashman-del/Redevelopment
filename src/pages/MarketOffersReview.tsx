import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, CheckCircle2, ExternalLink, Loader2, Pencil, Play, Trash2 } from 'lucide-react';
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
  updateMarketOffer,
  deleteMarketOffer,
  fetchDismissedDedupKeys,
  dismissDuplicateGroup,
} from '../lib/marketOffersApi';
import { logActivity } from '../lib/activityLogApi';
import { FINISH_STATUSES, MARKET_PROPERTY_TYPES, areaBucket, dedupKey, netSize, netPricePerSqm } from '../data/marketOffers';
import type { MarketOffer, FinishStatus } from '../data/marketOffers';

// Ручная верификация объявлений с Kufar (и позже Realt): помощница (Светлана)
// сверяет объявление по ссылке и правит поля, если источник отдал их
// неверно. Это ЖИВОЙ источник для таблицы на /rayon-minsk-mir — правки
// здесь видны там сразу, без пересинка (DistrictGuidePage.tsx считает
// медиану прямо из этих же строк).
//
// Верификация — только через карточку редактирования (кнопка
// "Редактировать"): в строке таблицы нет отдельных кликабельных
// переключателей отделки/обработки — это раньше загромождало таблицу и
// путало (см. историю в SEO_PLAN.md), теперь строка только показывает
// статусы (статичные бейджи), а меняются они в модалке. Любое сохранение
// через модалку — это и есть "проверил объявление", поэтому оно всегда
// ставит reviewed=true (см. updateMarketOffer), даже если по факту ничего
// не поменяли (свериться по ссылке и подтвердить "не указано" — тоже
// проверка). Reviewed=true заодно защищает всю строку от перезаписи при
// следующем месячном синке (см. scripts/sync-kufar-market-offers.mjs).
//
// Порядок работы: сначала группы дублей (адрес+площадь+иногда этаж
// совпадают у нескольких объявлений) — их нужно разобрать до одиночных
// объявлений, поэтому секция дублей всегда идёт первой на странице, а
// объявления внутри неё не показываются повторно в общей таблице ниже.
//
// "Начать верификацию" — пошаговый режим поверх того же порядка: по одной
// показывает либо ближайшую нерешённую группу дублей, либо (когда группы
// кончились) ближайшее непроверенное одиночное объявление — сразу в
// карточке редактирования. После решения группы/сохранения карточки
// подставляется следующее автоматически (см. verifyGroupTarget/
// verifySingleTarget ниже — оба выводятся реактивно из текущих данных, без
// отдельной очереди с индексом, поэтому переживают удаления/отклонения
// прямо во время прохода). "Пропустить" откладывает текущее до конца ЭТОЙ
// сессии верификации (skippedGroupKeys/skippedSingleIds — сбрасываются
// каждый раз при новом запуске), не путать с "Это разные помещения"
// (постоянное решение в БД).

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

// Статичные бейджи вместо переключателей — статус в строке таблицы только
// для справки, менять его можно только через карточку редактирования
// (см. комментарий вверху файла).
function FinishBadge({ status }: { status: FinishStatus }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'с отделкой' ? 'bg-ink/80 text-white' : 'bg-surface-muted text-ink-muted',
      )}
    >
      {FINISH_PILL_LABEL[status]}
    </span>
  );
}

function ReviewedBadge({ reviewed }: { reviewed: boolean }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        reviewed ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning',
      )}
    >
      {reviewed ? 'Проверено' : 'Не обработано'}
    </span>
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
  onEdit,
  onDelete,
}: {
  offer: MarketOffer;
  pending: boolean;
  onEdit: (offer: MarketOffer) => void;
  onDelete: (offer: MarketOffer) => void;
}) {
  return (
    <tr className={pending ? 'opacity-50' : undefined}>
      <td className="max-w-[240px] py-2.5 pr-3">
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
        <div className="text-xs text-ink-faint">{offer.source}</div>
      </td>
      <td className="max-w-[130px] py-2.5 px-2 text-ink-muted">{offer.propertyType}</td>
      <td className="whitespace-nowrap py-2.5 px-2 text-ink-muted">{offer.dealType === 'sale' ? 'Продажа' : 'Аренда'}</td>
      <td className="max-w-[140px] py-2.5 px-2 text-right tabular-nums text-ink-muted">
        <span className="whitespace-nowrap">
          {offer.size} м² <span className="text-ink-faint">({areaBucket(netSize(offer))})</span>
        </span>
        {offer.hasTerrace && (
          <div className="text-xs text-warning">терраса {offer.terraceArea ?? '?'} · чисто {netSize(offer)} м²</div>
        )}
      </td>
      <td className="whitespace-nowrap py-2.5 px-2 text-right tabular-nums text-ink-muted">{offer.floor ?? '—'}</td>
      <td className="max-w-[150px] py-2.5 px-2 text-right tabular-nums text-ink-muted">
        <span className="whitespace-nowrap">
          {offer.pricePerSqm} $/м²{offer.dealType === 'rent' ? '/мес' : ''}
        </span>
        {offer.hasTerrace && (
          <div className="text-xs text-warning">на чистую — {netPricePerSqm(offer)} $/м²</div>
        )}
      </td>
      <td className="whitespace-nowrap py-2.5 px-2">
        <FinishBadge status={offer.finishStatus as FinishStatus} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-2">
        <ReviewedBadge reviewed={offer.reviewed} />
      </td>
      <td className="whitespace-nowrap py-2.5 pl-2">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(offer)}
            className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs font-medium text-ink hover:border-border-strong hover:bg-surface-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
            Редактировать
          </button>
          <button type="button" onClick={() => onDelete(offer)} aria-label="Удалить объявление" className="p-1 text-ink-faint hover:text-danger">
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
        <th className="py-2 pr-3">Адрес / источник</th>
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
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [pendingGroupKey, setPendingGroupKey] = useState<string | null>(null);
  const [editingOffer, setEditingOffer] = useState<MarketOffer | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [verifying, setVerifying] = useState(false);
  const [skippedGroupKeys, setSkippedGroupKeys] = useState<Set<string>>(new Set());
  const [skippedSingleIds, setSkippedSingleIds] = useState<Set<number>>(new Set());

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

  // Одиночные объявления — таблица под секцией дублей (см. рендер ниже).
  // Дублей в ней не показываем: они уже разобраны отдельными карточками
  // выше, повтор в общем списке только путал бы, что уже проверено.
  const filtered = useMemo(() => {
    if (!offers) return [];
    const query = search.trim().toLowerCase();
    return offers
      .filter((o) => {
        if (duplicateKeyByOfferId.has(o.id)) return false;
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
  }, [offers, search, finishFilter, dealFilter, reviewFilter, sourceFilter, duplicateKeyByOfferId]);

  const duplicateGroupsList = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...duplicateGroups.entries()]
      .filter(([, group]) => !query || group.some((o) => (o.address ?? '').toLowerCase().includes(query)))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [duplicateGroups, search]);

  // Верификация всегда идёт по ВСЕМ группам/объявлениям, игнорируя поиск и
  // остальные фильтры на странице — это отдельный сквозной проход, не
  // привязанный к тому, что сейчас введено в поиске.
  const allGroupsSorted = useMemo(
    () => [...duplicateGroups.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    [duplicateGroups],
  );

  const ungroupedUnreviewed = useMemo(
    () => (offers ?? []).filter((o) => !o.reviewed && !duplicateKeyByOfferId.has(o.id)).sort((a, b) => a.size - b.size),
    [offers, duplicateKeyByOfferId],
  );

  const hasPendingVerification = allGroupsSorted.length > 0 || ungroupedUnreviewed.length > 0;

  // Текущая цель — первая группа/объявление, которые ещё не отложены в этой
  // сессии верификации ("Пропустить"). Оба выводятся заново на каждый
  // рендер, поэтому после удаления строки, отклонения группы или сохранения
  // карточки следующее подставляется само — без ручного управления индексом.
  const verifyGroupTarget = useMemo(() => {
    if (!verifying) return null;
    return allGroupsSorted.find(([key]) => !skippedGroupKeys.has(key)) ?? null;
  }, [verifying, allGroupsSorted, skippedGroupKeys]);

  const verifySingleTarget = useMemo(() => {
    if (!verifying || verifyGroupTarget) return null;
    return ungroupedUnreviewed.find((o) => !skippedSingleIds.has(o.id)) ?? null;
  }, [verifying, verifyGroupTarget, ungroupedUnreviewed, skippedSingleIds]);

  // "Осталось" не уменьшается от "Пропустить" — пропущенное всё ещё не
  // разобрано, просто временно не показывается в этом проходе.
  const verifyRemaining =
    allGroupsSorted.filter(([key]) => !skippedGroupKeys.has(key)).length +
    ungroupedUnreviewed.filter((o) => !skippedSingleIds.has(o.id)).length;

  const verifySkippedCount = skippedGroupKeys.size + skippedSingleIds.size;

  function patchOffer(id: number, patch: Partial<MarketOffer>) {
    setOffers((prev) => (prev ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)));
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

  function startVerification() {
    setSkippedGroupKeys(new Set());
    setSkippedSingleIds(new Set());
    setVerifying(true);
  }

  function stopVerification() {
    setVerifying(false);
    setEditingOffer(null);
    setEditForm(null);
  }

  function skipCurrentVerification() {
    if (verifyGroupTarget) {
      setSkippedGroupKeys((prev) => new Set(prev).add(verifyGroupTarget[0]));
    } else if (verifySingleTarget) {
      setSkippedSingleIds((prev) => new Set(prev).add(verifySingleTarget.id));
    }
  }

  // Во время верификации закрытие карточки (крестик/фон/"Пропустить") — это
  // тоже пропуск текущего одиночного объявления, а не просто закрытие: иначе
  // эффект ниже тут же открыл бы ту же карточку заново (цель не изменилась).
  function closeOrSkipEdit() {
    if (verifying && editingOffer) {
      setSkippedSingleIds((prev) => new Set(prev).add(editingOffer.id));
    }
    setEditingOffer(null);
    setEditForm(null);
  }

  // Подставляет карточку редактирования для текущей цели-одиночки во время
  // верификации — как только сохранение/пропуск меняют verifySingleTarget,
  // здесь открывается следующая.
  useEffect(() => {
    if (verifySingleTarget && editingOffer?.id !== verifySingleTarget.id) {
      openEdit(verifySingleTarget);
    }
  }, [verifySingleTarget, editingOffer]);

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
      logActivity('market_offer_verified');
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
            <div className="flex flex-wrap items-center justify-between gap-3">
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
              {!verifying && (
                <Button icon={<Play className="h-4 w-4" />} disabled={!hasPendingVerification} onClick={startVerification}>
                  Начать верификацию
                </Button>
              )}
            </div>
          )}

          {verifying ? (
            <div className="flex flex-col gap-3">
              <div className={cn('flex flex-wrap items-center justify-between gap-3 p-4', glassCardClass)} style={glassCardShadow}>
                <p className="text-sm font-semibold text-ink">Верификация — осталось {verifyRemaining}</p>
                <div className="flex gap-2">
                  {(verifyGroupTarget || verifySingleTarget) && (
                    <Button variant="secondary" onClick={skipCurrentVerification}>
                      Пропустить
                    </Button>
                  )}
                  <Button variant="ghost" onClick={stopVerification}>
                    Завершить проверку
                  </Button>
                </div>
              </div>

              {verifyGroupTarget ? (
                <div className={cn('flex flex-col gap-3 p-4', glassCardClass)} style={glassCardShadow}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-ink-muted">
                      <span className="font-semibold text-ink">{verifyGroupTarget[1][0].address ?? 'без адреса'}</span> ·{' '}
                      {verifyGroupTarget[1][0].size} м² · этаж {verifyGroupTarget[1][0].floor ?? '?'} ·{' '}
                      {verifyGroupTarget[1].length} объявления похожи друг на друга
                    </p>
                    <Button
                      variant="secondary"
                      icon={<Check className="h-4 w-4" />}
                      disabled={pendingGroupKey === verifyGroupTarget[0]}
                      onClick={() => handleDismissGroup(verifyGroupTarget[0])}
                    >
                      Это разные помещения
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] border-collapse text-sm">
                      <OfferTableHead />
                      <tbody className="divide-y divide-border">
                        {verifyGroupTarget[1].map((offer) => (
                          <OfferRow
                            key={offer.id}
                            offer={offer}
                            pending={pendingId === offer.id}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : verifySingleTarget ? (
                <p className="py-10 text-center text-sm text-ink-faint">
                  Заполните карточку редактирования и сохраните — следующее объявление откроется само.
                </p>
              ) : (
                <div className={cn('flex flex-col items-center gap-2 p-8 text-center', glassCardClass)} style={glassCardShadow}>
                  <CheckCircle2 className="h-8 w-8 text-success" />
                  <p className="text-sm font-semibold text-ink">Всё проверено!</p>
                  {verifySkippedCount > 0 && (
                    <p className="text-xs text-ink-faint">
                      Пропущено {verifySkippedCount} — найдёте их в обычном списке ниже.
                    </p>
                  )}
                  <Button className="mt-2" onClick={stopVerification}>
                    Вернуться к списку
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
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
                    <ToggleGroup
                      label="Сделка"
                      options={[...DEAL_FILTER_OPTIONS]}
                      value={dealFilter}
                      onChange={(v) => setDealFilter(v as DealFilter)}
                    />
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
                  Фильтры действуют на таблицу одиночных объявлений ниже — дубли выше показаны все, без фильтров,
                  чтобы не спрятать половину пары.
                </p>
              </div>

              {duplicateGroups.size > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-ink">
                Дубли для проверки — {duplicateGroups.size} {duplicateGroups.size === 1 ? 'группа' : 'группы'}
              </h2>
              <p className="text-xs text-ink-faint">
                Похожие объявления сгруппированы по адресу и площади (и этажу, если он известен) — откройте ссылку,
                сверьте вручную и либо удалите лишнюю копию, либо подтвердите, что это разные помещения. Разберите
                дубли, прежде чем переходить к одиночным объявлениям ниже.
              </p>
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
                    <table className="w-full min-w-[900px] border-collapse text-sm">
                      <OfferTableHead />
                      <tbody className="divide-y divide-border">
                        {group.map((offer) => (
                          <OfferRow
                            key={offer.id}
                            offer={offer}
                            pending={pendingId === offer.id}
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
                <p className="py-4 text-center text-sm text-ink-faint">Дублей по этому запросу не найдено.</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {duplicateGroups.size > 0 && <h2 className="text-sm font-semibold text-ink">Одиночные объявления</h2>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <OfferTableHead />
                <tbody className="divide-y divide-border">
                  {filtered.map((offer) => (
                    <OfferRow
                      key={offer.id}
                      offer={offer}
                      pending={pendingId === offer.id}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <p className="py-6 text-center text-sm text-ink-faint">Ничего не найдено.</p>}
            </div>
          </div>
            </>
          )}
        </div>
      )}

      <Modal open={!!editingOffer} onClose={closeOrSkipEdit} title="Редактировать объявление">
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
            <div className="flex items-center justify-between gap-3">
              {verifying && (
                <button type="button" onClick={stopVerification} className="text-xs text-ink-faint underline hover:text-ink">
                  Завершить проверку
                </button>
              )}
              <div className="flex flex-1 justify-end gap-3">
                <Button type="button" variant="secondary" onClick={closeOrSkipEdit}>
                  {verifying ? 'Пропустить' : 'Отмена'}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
