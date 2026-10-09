import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Factory, Mail, Plus, Search, Send } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button, buttonClasses } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { SearchInput } from '../ui/SearchInput';
import { Select } from '../ui/Select';
import { cn } from '../../lib/cn';
import {
  findCatalogCategory,
  SUPPLIER_CATALOG,
  SUPPLIER_CATALOG_CATEGORIES,
  type SupplierCatalogCategory,
  type SupplierCatalogHub,
} from '../../data/supplierCatalog';
import { fetchSupplyCategories, type SupplyCategoryDto } from '../../lib/supplyCategoriesApi';
import { fetchSupplierCatalogHints, type SupplierCatalogHintRow } from '../../lib/suppliersApi';
import {
  countryFlag,
  supplierWebsiteHost,
  SUPPLIER_COUNTRIES,
  type SupplierOffer,
  type SupplierRequest,
} from '../../data/supplierResearch';
import type { SupplierSiteSnapshot } from '../../data/supplierSiteSnapshots';
import type { SupplierOfferEmail } from '../../data/supplierOfferEmails';
import type { SupplierQuote } from '../../data/supplierQuotes';
import type { PurchaseOrder } from '../../data/purchaseOrders';
import {
  emptyHints,
  matchCatalogNavigation,
  matchCatalogOffer,
  normalizeSearch,
  type CatalogMatchKind,
} from './productSearch';
import {
  buildCatalogEngagementIndex,
  CATALOG_ENGAGEMENT_LABEL,
  compareByEngagementThenName,
  type CatalogEngagementIndex,
  type CatalogEngagementTier,
} from './catalogEngagement';
import { buildCatalogMailStats, mailStatsForOffer, type CatalogMailStats } from './catalogMailStats';
import {
  brandsInSuppliers,
  buildCarriedItemIndex,
  matchCarriedPosition,
  supplierHasBrand,
} from './catalogCarriedItems';

// Каталог поставщиков: хабы → категории → компании. Владелец, 2026-09-12:
// «нравится, как организованы визуально категории у ВсеИнструменты, особенно
// большие карточки». Первый экран — большие плитки хабов с числом компаний,
// внутри хаба — плитки категорий, внутри категории — список.
//
// Поставщик в категории — по ЛЮБОМУ из двух признаков (владелец, 2026-09-12):
// название строки категории закупки совпадает с категорией ИЛИ по снимку сайта
// есть товарная группа плитки. Страна — фильтр над всем каталогом.
//
// 2026-10-09: поиск по полям карточки + ранжирование заказы→КП→письма;
// 2026-10-09 (второй заход): чипы брендов, «Запросить цены» из категории,
// счётчики непрочитанных/ждут ответа, свёртка холодных, поиск по позиции КП.

interface CategoryStats {
  category: SupplierCatalogCategory;
  suppliers: SupplierOffer[];
}

interface HubStats {
  hub: SupplierCatalogHub;
  categories: CategoryStats[];
  total: number;
}

const COLD_COLLAPSE_AFTER = 6;

function OpenDetailButton({ offer, onOpenDetail }: { offer: SupplierOffer; onOpenDetail: (o: SupplierOffer) => void }) {
  if (offer.supplierId) {
    return (
      <Link to={`/admin/suppliers/${offer.supplierId}`} className={buttonClasses('secondary')}>
        Подробнее
      </Link>
    );
  }
  return (
    <Button type="button" variant="secondary" onClick={() => onOpenDetail(offer)}>
      Подробнее
    </Button>
  );
}

function offerGroups(o: SupplierOffer, snapshotByHost: Map<string, SupplierSiteSnapshot>): string[] {
  return snapshotByHost.get(supplierWebsiteHost(o.websiteUrl))?.categories ?? [];
}

function catalogLabelFor(
  o: SupplierOffer,
  requestTitleById: Map<string, string>,
  snapshotByHost: Map<string, SupplierSiteSnapshot>,
  extraGroupsByTile: Map<string, string[]>,
): string {
  const title = requestTitleById.get(o.requestId) ?? '';
  const home = findCatalogCategory(title);
  if (home) return home.name;
  const groups = offerGroups(o, snapshotByHost);
  const bySite = SUPPLIER_CATALOG_CATEGORIES.find((c) =>
    tileGroups(c, extraGroupsByTile).some((g) => groups.includes(g)),
  );
  return bySite?.name ?? title ?? '—';
}

function countryLabel(country: string): string {
  return `${countryFlag(country)} ${country}`;
}

function countryByLabel(label: string): string {
  return SUPPLIER_COUNTRIES.find((c) => countryLabel(c) === label) ?? SUPPLIER_COUNTRIES[0];
}

function tileGroups(category: SupplierCatalogCategory, extraGroupsByTile: Map<string, string[]>): string[] {
  const extra = extraGroupsByTile.get(category.name);
  return extra && extra.length > 0 ? [...category.supplyGroups, ...extra] : category.supplyGroups;
}

const tileClass =
  'flex flex-col justify-between gap-3 rounded-3xl border border-white/70 bg-gradient-to-br from-white/80 to-white/40 p-5 text-left shadow-[0_8px_24px_rgba(20,21,26,0.06)] backdrop-blur-xl transition hover:border-primary/40 hover:from-white hover:to-white/70';

const rowClass =
  'flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-white/50 px-4 py-3 transition hover:border-border-strong hover:bg-white/80';

export function SupplierCatalog({
  offers,
  requests,
  snapshotByHost,
  emails,
  quotes,
  orders,
  onOpenDetail,
  onAddSupplier,
  onRequestPrices,
  onOpenLetters,
}: {
  offers: SupplierOffer[];
  requests: SupplierRequest[];
  snapshotByHost: Map<string, SupplierSiteSnapshot>;
  emails: SupplierOfferEmail[];
  quotes: SupplierQuote[];
  orders: PurchaseOrder[];
  onOpenDetail: (o: SupplierOffer) => void;
  onAddSupplier: () => void;
  // Открыть мастер «Запросить цены» (ведомость → рассылка) с вкладки каталога.
  onRequestPrices: () => void;
  // Перейти в «Письма» к переписке этой компании.
  onOpenLetters: (offer: SupplierOffer) => void;
}) {
  const [country, setCountry] = useState<string>(SUPPLIER_COUNTRIES[0]);
  const [search, setSearch] = useState('');
  const [hubName, setHubName] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);

  const purchaseRequestIds = useMemo(() => new Set(requests.filter((r) => r.ledgerId).map((r) => r.id)), [requests]);
  const baseOffers = useMemo(
    () => offers.filter((o) => !purchaseRequestIds.has(o.requestId) && (!o.country.trim() || o.country === country)),
    [offers, country, purchaseRequestIds],
  );

  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [hintsById, setHintsById] = useState<Map<string, SupplierCatalogHintRow>>(new Map());
  useEffect(() => {
    fetchSupplierCatalogHints()
      .then(setHintsById)
      .catch(() => {});
  }, []);
  const isFactory = (o: SupplierOffer) =>
    !!o.supplierId && hintsById.get(o.supplierId)?.kind === 'manufacturer';
  const kindCounts = useMemo(() => {
    const factories = new Set<string>();
    const others = new Set<string>();
    for (const o of baseOffers) {
      if (!o.verified) continue;
      const key = o.supplierId ?? o.id;
      if (o.supplierId && hintsById.get(o.supplierId)?.kind === 'manufacturer') factories.add(key);
      else others.add(key);
    }
    for (const k of factories) others.delete(k);
    return { factories: factories.size, others: others.size };
  }, [baseOffers, hintsById]);
  const countryOffers = useMemo(
    () =>
      kindFilter === 'all'
        ? baseOffers
        : baseOffers.filter(
            (o) =>
              (kindFilter === 'factories') ===
              (!!o.supplierId && hintsById.get(o.supplierId)?.kind === 'manufacturer'),
          ),
    [baseOffers, kindFilter, hintsById],
  );

  const requestTitleById = useMemo(() => new Map(requests.map((r) => [r.id, r.title])), [requests]);
  const engagement = useMemo(
    () => buildCatalogEngagementIndex({ offers, orders, quotes, emails }),
    [offers, orders, quotes, emails],
  );
  const mailStats = useMemo(() => buildCatalogMailStats(offers, emails), [offers, emails]);
  const carriedByOffer = useMemo(() => buildCarriedItemIndex(offers, quotes), [offers, quotes]);

  const [dbCategories, setDbCategories] = useState<SupplyCategoryDto[]>([]);
  useEffect(() => {
    fetchSupplyCategories()
      .then(setDbCategories)
      .catch(() => {});
  }, []);

  const extraGroupsByTile = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of dbCategories) {
      if (!c.tile) continue;
      const list = map.get(c.tile);
      if (list) list.push(c.name);
      else map.set(c.tile, [c.name]);
    }
    return map;
  }, [dbCategories]);

  const hubs = useMemo<HubStats[]>(() => {
    return SUPPLIER_CATALOG.map((hub) => {
      const seen = new Set<string>();
      const categories = hub.categories.map((category) => {
        const groups = new Set(tileGroups(category, extraGroupsByTile));
        const suppliers: SupplierOffer[] = [];
        const companies = new Set<string>();
        for (const o of countryOffers) {
          if (!o.verified) continue;
          const title = requestTitleById.get(o.requestId) ?? '';
          const titleMatch = findCatalogCategory(title) === category;
          const hasGroup = offerGroups(o, snapshotByHost).some((g) => groups.has(g));
          if (!titleMatch && !hasGroup) continue;
          if (o.supplierId && companies.has(o.supplierId)) continue;
          if (o.supplierId) companies.add(o.supplierId);
          suppliers.push(o);
          seen.add(o.supplierId ?? o.id);
        }
        return {
          category,
          suppliers: suppliers.sort((a, b) => compareByEngagementThenName(a, b, engagement)),
        };
      });
      return { hub, categories, total: seen.size };
    });
  }, [countryOffers, requestTitleById, snapshotByHost, extraGroupsByTile, engagement]);

  const currentHub = hubs.find((h) => h.hub.name === hubName) ?? null;
  const currentCategory = currentHub?.categories.find((c) => c.category.name === categoryName) ?? null;

  const searchQuery = normalizeSearch(search.trim());
  const navHits = useMemo(() => (searchQuery ? matchCatalogNavigation(searchQuery) : []), [searchQuery]);
  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    const results: {
      offer: SupplierOffer;
      categoryLabel: string;
      byName: boolean;
      hits: SupplierSiteSnapshot['sections'];
      reason: string | null;
      kinds: CatalogMatchKind[];
      tier: CatalogEngagementTier;
      carried: boolean;
    }[] = [];
    const companies = new Set<string>();
    for (const o of countryOffers) {
      if (!o.verified) continue;
      const hints = o.supplierId ? hintsById.get(o.supplierId) : undefined;
      const { match } = matchCatalogOffer(
        o,
        snapshotByHost,
        searchQuery,
        requestTitleById.get(o.requestId),
        hints ?? emptyHints(),
      );
      const carried = matchCarriedPosition(o, offers, carriedByOffer, searchQuery);
      if (!match.matched && !carried.matched) continue;
      if (o.supplierId && companies.has(o.supplierId)) continue;
      if (o.supplierId) companies.add(o.supplierId);
      results.push({
        offer: o,
        categoryLabel: catalogLabelFor(o, requestTitleById, snapshotByHost, extraGroupsByTile),
        byName: match.byName,
        hits: match.hits,
        reason: match.matched
          ? match.reason
          : carried.itemName
            ? `возил: ${carried.itemName}`
            : null,
        kinds: match.kinds,
        tier: engagement.tierOf(o),
        carried: carried.matched && !match.matched,
      });
    }
    return results.sort(
      (a, b) =>
        a.tier - b.tier ||
        Number(b.byName) - Number(a.byName) ||
        Number(b.carried) - Number(a.carried) ||
        b.hits.length - a.hits.length ||
        a.offer.name.localeCompare(b.offer.name, 'ru'),
    );
  }, [
    countryOffers,
    offers,
    requestTitleById,
    searchQuery,
    snapshotByHost,
    extraGroupsByTile,
    hintsById,
    engagement,
    carriedByOffer,
  ]);

  const openHub = (h: HubStats) => {
    setHubName(h.hub.name);
    setGroupFilter(null);
    setBrandFilter(null);
    setCategoryName(h.hub.categories.length === 1 ? h.hub.categories[0].name : null);
  };

  const crumb = (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        className="font-medium text-primary-hover hover:underline"
        onClick={() => {
          setHubName(null);
          setCategoryName(null);
          setGroupFilter(null);
          setBrandFilter(null);
        }}
      >
        Каталог
      </button>
      {currentHub && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-ink-faint" />
          {currentCategory ? (
            <button
              type="button"
              className="font-medium text-primary-hover hover:underline"
              onClick={() => {
                setCategoryName(null);
                setGroupFilter(null);
                setBrandFilter(null);
              }}
            >
              {currentHub.hub.name}
            </button>
          ) : (
            <span className="text-ink">{currentHub.hub.name}</span>
          )}
        </>
      )}
      {currentCategory && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-ink-faint" />
          <span className="text-ink">{currentCategory.category.name}</span>
        </>
      )}
    </div>
  );

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-lg font-bold tracking-tight text-ink">Каталог поставщиков</span>
          <span className="text-xs text-ink-muted">Сверху — с кем уже работали. Поиск — по карточке, бренду и позициям КП.</span>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <Button type="button" icon={<Send className="h-4 w-4" />} onClick={onRequestPrices} className="px-4 py-1.5 text-sm">
            Запросить цены
          </Button>
          <Button type="button" variant="secondary" onClick={onAddSupplier} className="px-4 py-1.5 text-sm">
            <Plus className="h-4 w-4" />
            Добавить
          </Button>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название, бренд, ИНН, email, позиция КП…"
            wrapperClassName="w-full max-w-[340px]"
          />
          <Select
            pill
            options={SUPPLIER_COUNTRIES.map(countryLabel)}
            value={countryLabel(country)}
            onChange={(label) => setCountry(countryByLabel(label))}
            triggerClassName="py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 self-start rounded-full bg-surface-muted p-1 text-sm">
        {(
          [
            ['all', 'Все', kindCounts.factories + kindCounts.others],
            ['factories', 'Заводы', kindCounts.factories],
            ['others', 'Остальные', kindCounts.others],
          ] as [KindFilter, string, number][]
        ).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => setKindFilter(key)}
            aria-pressed={kindFilter === key}
            className={cn(
              'rounded-full px-3 py-1.5 transition-colors',
              kindFilter === key ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            )}
          >
            {label} <span className="tabular-nums text-ink-faint">{n}</span>
          </button>
        ))}
      </div>

      {searchQuery ? (
        <div className="flex flex-col gap-3">
          {navHits.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Категории</span>
              <div className="flex flex-wrap gap-2">
                {navHits.map((hit) => (
                  <button
                    key={`${hit.kind}:${hit.hubName}:${hit.categoryName ?? ''}`}
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setHubName(hit.hubName);
                      setCategoryName(hit.categoryName);
                      setGroupFilter(null);
                      setBrandFilter(null);
                    }}
                    className="rounded-full border border-border bg-white/70 px-3 py-1.5 text-sm text-ink shadow-sm transition hover:border-primary/50"
                  >
                    {hit.kind === 'hub' ? hit.label : `${hit.hubName} · ${hit.label}`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <span className="text-sm text-ink-muted">
            {searchResults.length === 0 && navHits.length === 0
              ? `Ничего не нашлось по «${search.trim()}».`
              : searchResults.length === 0
                ? 'Компаний нет — выше совпали категории.'
                : `Найдено ${searchResults.length} ${plural(searchResults.length, 'поставщик', 'поставщика', 'поставщиков')}.`}
          </span>
          {searchResults.map(({ offer, categoryLabel, byName, hits, reason, tier, carried }) => (
            <SupplierRow
              key={offer.id}
              offer={offer}
              categoryLabel={categoryLabel}
              isFactory={isFactory(offer)}
              tier={tier}
              mail={mailStatsForOffer(offer, mailStats)}
              onOpenDetail={onOpenDetail}
              onOpenLetters={onOpenLetters}
              subtitle={
                byName
                  ? null
                  : hits.length > 0
                    ? (
                        <>
                          на сайте:{' '}
                          {hits.slice(0, 3).map((sec, i) => (
                            <span key={sec.url + i}>
                              {i > 0 && ', '}
                              <a href={sec.url} target="_blank" rel="noreferrer" className="text-primary-hover hover:underline">
                                {sec.title}
                              </a>
                            </span>
                          ))}
                          {hits.length > 3 && ` и ещё ${hits.length - 3}`}
                        </>
                      )
                    : reason ?? (carried ? 'позиция из КП' : null)
              }
            />
          ))}
        </div>
      ) : (
        <>
          {crumb}

          {!currentHub && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hubs.map((h) => {
                const live = h.categories.reduce(
                  (n, c) => n + c.suppliers.filter((o) => engagement.tierOf(o) < 3).length,
                  0,
                );
                return (
                  <button key={h.hub.name} type="button" onClick={() => openHub(h)} className={cn(tileClass, 'min-h-[140px]')}>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-base font-semibold tracking-tight text-ink">{h.hub.name}</span>
                      <span className="line-clamp-2 text-xs leading-relaxed text-ink-muted">{h.hub.description}</span>
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold tabular-nums text-ink">{h.total}</span>
                        <span className="text-xs text-ink-faint">
                          {plural(h.total, 'компания', 'компании', 'компаний')} · {h.hub.categories.length}{' '}
                          {plural(h.hub.categories.length, 'категория', 'категории', 'категорий')}
                        </span>
                      </div>
                      {live > 0 && (
                        <span className="rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success">
                          {live} в работе
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {currentHub && !currentCategory && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-ink-muted">{currentHub.hub.description}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {currentHub.categories.map((c) => {
                  const live = c.suppliers.filter((o) => engagement.tierOf(o) < 3).length;
                  return (
                    <button
                      key={c.category.name}
                      type="button"
                      onClick={() => {
                        setCategoryName(c.category.name);
                        setGroupFilter(null);
                        setBrandFilter(null);
                      }}
                      className={tileClass}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="font-semibold tracking-tight text-ink">{c.category.name}</span>
                        <Badge tone="neutral">
                          {c.category.defaultComparisonMode === 'lot' ? 'поставка целиком' : 'по материалам'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {c.category.supplyGroups.slice(0, 4).map((g) => (
                          <span key={g} className="rounded-full border border-border/80 bg-white/50 px-2 py-0.5 text-[11px] text-ink-muted">
                            {g}
                          </span>
                        ))}
                        {c.category.supplyGroups.length > 4 && (
                          <span className="text-[11px] text-ink-faint">+{c.category.supplyGroups.length - 4}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular-nums">
                        <span className="text-ink">
                          <span className="text-xl font-semibold">{c.suppliers.length}</span>{' '}
                          {plural(c.suppliers.length, 'поставщик', 'поставщика', 'поставщиков')}
                        </span>
                        {live > 0 && <span className="text-xs text-success">{live} с историей</span>}
                        {c.suppliers.length === 0 && <Badge tone="warning">базу набирать</Badge>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {currentCategory && (
            <CategoryView
              stats={currentCategory}
              groupFilter={groupFilter}
              onGroupFilter={setGroupFilter}
              brandFilter={brandFilter}
              onBrandFilter={setBrandFilter}
              snapshotByHost={snapshotByHost}
              hintsById={hintsById}
              onOpenDetail={onOpenDetail}
              onOpenLetters={onOpenLetters}
              onRequestPrices={onRequestPrices}
              isFactory={isFactory}
              engagement={engagement}
              mailStats={mailStats}
            />
          )}
        </>
      )}
    </Card>
  );
}

function SupplierRow({
  offer,
  categoryLabel,
  isFactory,
  tier,
  mail,
  onOpenDetail,
  onOpenLetters,
  subtitle,
}: {
  offer: SupplierOffer;
  categoryLabel?: string;
  isFactory: boolean;
  tier: CatalogEngagementTier;
  mail: CatalogMailStats;
  onOpenDetail: (o: SupplierOffer) => void;
  onOpenLetters: (o: SupplierOffer) => void;
  subtitle?: ReactNode;
}) {
  const accent =
    tier === 0 ? 'border-l-success' : tier === 1 ? 'border-l-warning' : tier === 2 ? 'border-l-ink-faint' : 'border-l-transparent';
  return (
    <div className={cn(rowClass, 'border-l-4', accent)}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium text-ink">{offer.name}</span>
          {isFactory && <FactoryMark />}
          <EngagementMark tier={tier} />
          {mail.unread > 0 && (
            <button
              type="button"
              onClick={() => onOpenLetters(offer)}
              className="inline-flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white"
              title="Непрочитанные — открыть переписку"
            >
              <Mail className="h-3 w-3" />
              {mail.unread}
            </button>
          )}
          {mail.waiting && mail.unread === 0 && (
            <button
              type="button"
              onClick={() => onOpenLetters(offer)}
              className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-medium text-warning"
              title="Ждём ответа"
            >
              ждём ответа
            </button>
          )}
          {categoryLabel && <span className="text-xs text-ink-faint">{categoryLabel}</span>}
          {!offer.country.trim() && <span className="text-xs text-ink-faint">страна не указана</span>}
        </div>
        {subtitle && <span className="text-xs text-ink-muted">{subtitle}</span>}
      </div>
      <OpenDetailButton offer={offer} onOpenDetail={onOpenDetail} />
    </div>
  );
}

function CategoryView({
  stats,
  groupFilter,
  onGroupFilter,
  brandFilter,
  onBrandFilter,
  snapshotByHost,
  hintsById,
  onOpenDetail,
  onOpenLetters,
  onRequestPrices,
  isFactory,
  engagement,
  mailStats,
}: {
  stats: CategoryStats;
  groupFilter: string | null;
  onGroupFilter: (g: string | null) => void;
  brandFilter: string | null;
  onBrandFilter: (b: string | null) => void;
  snapshotByHost: Map<string, SupplierSiteSnapshot>;
  hintsById: Map<string, SupplierCatalogHintRow>;
  onOpenDetail: (o: SupplierOffer) => void;
  onOpenLetters: (o: SupplierOffer) => void;
  onRequestPrices: () => void;
  isFactory: (o: SupplierOffer) => boolean;
  engagement: CatalogEngagementIndex;
  mailStats: Map<string, CatalogMailStats>;
}) {
  const { category } = stats;
  const [showCold, setShowCold] = useState(false);

  const matchesGroup = (o: SupplierOffer) => !groupFilter || offerGroups(o, snapshotByHost).includes(groupFilter);
  const matchesBrand = (o: SupplierOffer) => !brandFilter || supplierHasBrand(o, brandFilter, hintsById);
  const groupCount = (g: string) =>
    stats.suppliers.filter((o) => offerGroups(o, snapshotByHost).includes(g)).length;

  const filtered = stats.suppliers.filter((o) => matchesGroup(o) && matchesBrand(o));
  const live = filtered.filter((o) => engagement.tierOf(o) < 3);
  const cold = filtered.filter((o) => engagement.tierOf(o) === 3);
  const collapseCold = cold.length > COLD_COLLAPSE_AFTER && live.length > 0;
  const visibleCold = collapseCold && !showCold ? [] : cold;
  const brands = brandsInSuppliers(stats.suppliers, hintsById).slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">Что сюда входит: {category.includes.join('; ')}.</p>
        <Button type="button" icon={<Send className="h-4 w-4" />} onClick={onRequestPrices} className="shrink-0 px-4 py-1.5 text-sm">
          Запросить цены
        </Button>
      </div>

      {(category.supplyGroups.length > 1 || brands.length > 0) && (
        <div className="flex flex-col gap-2">
          {category.supplyGroups.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Группы</span>
              <Chip active={groupFilter === null} onClick={() => onGroupFilter(null)}>
                все
              </Chip>
              {category.supplyGroups.map((g) => (
                <Chip key={g} active={groupFilter === g} onClick={() => onGroupFilter(groupFilter === g ? null : g)}>
                  {g} · {groupCount(g)}
                </Chip>
              ))}
            </div>
          )}
          {brands.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Бренды</span>
              <Chip active={brandFilter === null} onClick={() => onBrandFilter(null)}>
                все
              </Chip>
              {brands.map(({ brand, count }) => (
                <Chip key={brand} active={brandFilter === brand} onClick={() => onBrandFilter(brandFilter === brand ? null : brand)}>
                  {brand} · {count}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-ink-faint">
          <Search className="h-4 w-4" />
          {stats.suppliers.length === 0
            ? 'В базе пока никого — эту категорию придётся набирать веб-поиском.'
            : 'По выбранным фильтрам никого нет.'}
        </div>
      )}

      {live.length > 0 && (
        <Section title={`С историей (${live.length})`} hint="Заказы, КП или переписка — сверху приоритетнее.">
          {live.map((o) => (
            <SupplierRow
              key={o.id}
              offer={o}
              isFactory={isFactory(o)}
              tier={engagement.tierOf(o)}
              mail={mailStatsForOffer(o, mailStats)}
              onOpenDetail={onOpenDetail}
              onOpenLetters={onOpenLetters}
            />
          ))}
        </Section>
      )}

      {visibleCold.length > 0 && (
        <Section
          title={live.length > 0 ? `Остальные (${cold.length})` : `Поставщики (${cold.length})`}
          hint={live.length > 0 ? 'Пока без заказов, КП и писем.' : undefined}
        >
          {visibleCold.map((o) => (
            <SupplierRow
              key={o.id}
              offer={o}
              isFactory={isFactory(o)}
              tier={3}
              mail={mailStatsForOffer(o, mailStats)}
              onOpenDetail={onOpenDetail}
              onOpenLetters={onOpenLetters}
            />
          ))}
        </Section>
      )}

      {collapseCold && !showCold && (
        <button
          type="button"
          onClick={() => setShowCold(true)}
          className="inline-flex items-center justify-center gap-1.5 self-start rounded-full border border-border bg-white/60 px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-border-strong hover:text-ink"
        >
          Ещё {cold.length} без истории
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs tabular-nums transition',
        active ? 'border-ink bg-ink text-white' : 'border-border bg-white/50 text-ink-muted hover:border-ink-faint hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

type KindFilter = 'all' | 'factories' | 'others';

function FactoryMark() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
      <Factory className="h-3 w-3" />
      завод
    </span>
  );
}

function EngagementMark({ tier }: { tier: CatalogEngagementTier }) {
  const label = CATALOG_ENGAGEMENT_LABEL[tier];
  if (!label) return null;
  const tone = tier === 0 ? 'success' : tier === 1 ? 'warning' : 'neutral';
  return <Badge tone={tone}>{label}</Badge>;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink">{title}</span>
        {hint && <span className="text-xs text-ink-faint">{hint}</span>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
