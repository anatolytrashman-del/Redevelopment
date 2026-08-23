import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { SearchInput } from '../components/ui/SearchInput';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { fetchMarketOffers, setMarketOfferFinishStatus, deleteMarketOffer } from '../lib/marketOffersApi';
import { FINISH_STATUSES, areaBucket } from '../data/marketOffers';
import type { MarketOffer, FinishStatus } from '../data/marketOffers';

// Ручная верификация объявлений с Kufar (и позже Realt) — владелец сам
// проставляет статус отделки (у большинства объявлений его нет в исходных
// данных, см. SEO_PLAN.md) и заодно отсеивает битые/сомнительные строки.
// Это ЖИВОЙ источник для таблицы на /rayon-minsk-mir — правки здесь видны
// там сразу, без пересинка (см. DistrictGuidePage.tsx, buildMarketPivot
// считает медиану прямо из этих же строк).

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

const FINISH_PILL_LABEL: Record<FinishStatus, string> = {
  'с отделкой': 'С отделкой',
  'без отделки': 'Без отделки',
  'не указано': 'Не указано',
};

function FinishStatusPicker({
  value,
  verified,
  onChange,
}: {
  value: FinishStatus;
  verified: boolean;
  onChange: (status: FinishStatus) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {FINISH_STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onChange(status)}
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
            value === status
              ? verified
                ? 'bg-primary text-white'
                : 'bg-ink/80 text-white'
              : 'bg-surface-muted text-ink-muted hover:bg-border',
          )}
        >
          {FINISH_PILL_LABEL[status]}
        </button>
      ))}
    </div>
  );
}

export function MarketOffersReview() {
  const [offers, setOffers] = useState<MarketOffer[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [finishFilter, setFinishFilter] = useState<FinishFilter>('Не указано');
  const [dealFilter, setDealFilter] = useState<DealFilter>('Все');
  const [pendingId, setPendingId] = useState<number | null>(null);

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
      verified: offers.filter((o) => o.finishStatusVerified).length,
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
        if (query && !(o.address ?? '').toLowerCase().includes(query) && !o.propertyType.toLowerCase().includes(query)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.size - b.size);
  }, [offers, search, finishFilter, dealFilter]);

  async function handleFinishChange(offer: MarketOffer, status: FinishStatus) {
    setPendingId(offer.id);
    try {
      await setMarketOfferFinishStatus(offer.id, status);
      setOffers((prev) =>
        (prev ?? []).map((o) => (o.id === offer.id ? { ...o, finishStatus: status, finishStatusVerified: true } : o)),
      );
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
              не указано {counts.unknown} · подтверждено вручную {counts.verified}
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
                <ToggleGroup options={[...DEAL_FILTER_OPTIONS]} value={dealFilter} onChange={(v) => setDealFilter(v as DealFilter)} />
                <ToggleGroup
                  options={[...FINISH_FILTER_OPTIONS]}
                  value={finishFilter}
                  onChange={(v) => setFinishFilter(v as FinishFilter)}
                />
              </div>
            </div>
            <p className="text-xs text-ink-faint">
              Отмеченный статус сразу учитывается в таблице на /rayon-minsk-mir и больше не перезатирается
              автоматическим синком.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  <th className="py-2 pr-3">Адрес</th>
                  <th className="py-2 px-2">Тип</th>
                  <th className="py-2 px-2">Сделка</th>
                  <th className="py-2 px-2 text-right">Площадь</th>
                  <th className="py-2 px-2 text-right">Цена / м²</th>
                  <th className="py-2 px-2">Отделка</th>
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((offer) => (
                  <tr key={offer.id} className={pendingId === offer.id ? 'opacity-50' : undefined}>
                    <td className="max-w-[220px] py-2.5 pr-3">
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
                    <td className="py-2.5 px-2 text-ink-muted">{offer.propertyType}</td>
                    <td className="py-2.5 px-2 text-ink-muted">{offer.dealType === 'sale' ? 'Продажа' : 'Аренда'}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-ink-muted">
                      {offer.size} м² <span className="text-ink-faint">({areaBucket(offer.size)})</span>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-ink-muted">
                      {offer.pricePerSqm} $/м²{offer.dealType === 'rent' ? '/мес' : ''}
                    </td>
                    <td className="py-2.5 px-2">
                      <FinishStatusPicker
                        value={offer.finishStatus as FinishStatus}
                        verified={offer.finishStatusVerified}
                        onChange={(status) => handleFinishChange(offer, status)}
                      />
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(offer)}
                        aria-label="Удалить объявление"
                        className="text-ink-faint hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="py-6 text-center text-sm text-ink-faint">Ничего не найдено.</p>}
          </div>
        </div>
      )}
    </>
  );
}
