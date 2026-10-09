import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Factory, Plus, Search } from 'lucide-react';
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

// Каталог поставщиков: хабы → категории → компании. Владелец, 2026-09-12:
// «нравится, как организованы визуально категории у ВсеИнструменты, особенно
// большие карточки». Первый экран — большие плитки хабов с числом компаний,
// внутри хаба — плитки категорий, внутри категории — список.
//
// Поставщик в категории — по ЛЮБОМУ из двух признаков (владелец, 2026-09-12,
// вторая правка: «сделай категории с сайта сущностью по умолчанию — если по
// сайту поняли, что поставщик поставляет категорию, значит мы её ему
// присваиваем», разделения на «подтверждённых» и «по сайту» больше нет):
// название строки категории закупки совпадает с категорией (см.
// LEGACY_REQUEST_TITLES в data/supplierCatalog.ts) ИЛИ по снимку сайта у
// поставщика есть хотя бы одна товарная группа плитки. Один и тот же
// поставщик так может оказаться сразу в нескольких плитках — это ожидаемо,
// плитка отвечает «кто это реально возит», а не «в какую строку его завели».
//
// Пятая правка того же дня: убрана отдельная сущность «универсальный
// поставщик»/«база». Раньше гипермаркет с группой «Строительный гипермаркет»
// на снимке сайта уходил в отдельный хаб-резервуар вместо профильных плиток
// (владелец: «если у поставщика есть керамогранит — выводим его в категории
// керамогранита, если есть электрика — в электрике, и по аналогии»). Теперь
// никакого отдельного «универсального» узла нет и не было: гипермаркет —
// просто поставщик, который матчится сразу во МНОГИЕ плитки правилом №2
// выше (у него на снимке много групп), это не отдельная сущность, а
// естественное следствие того же правила.
//
// Страна — не отдельный список внутри плитки (третья правка того же дня:
// «не друг под другом выводить категории, а в целом вверху каталога выбор
// иконки флага и далее идёт поиск уже по нужной стране»), а фильтр НАД всем
// каталогом: один переключатель флагов в шапке решает, что считают и хабы, и
// категории, и списки компаний — вся навигация ниже видит уже отфильтрованные
// по стране предложения. Карточки без указанной страны (их 25 из 278, старые
// записи) показываются при любом флаге — молчаливо прятать их неправильно.

interface CategoryStats {
  category: SupplierCatalogCategory;
  // Поставщики категории — по названию строки закупки ИЛИ по товарной группе
  // со снимка сайта, в одном списке: владелец, 2026-09-12 («сделай категории
  // с сайта сущностью по умолчанию — если по сайту поняли, что поставщик
  // поставляет категорию, значит мы её ему присваиваем») отменил разделение
  // на «подтверждённых вручную» и «найденных по сайту». Гипермаркеты и базы
  // здесь не отдельный бакет (пятая правка того же дня) — они просто
  // попадают в этот же список каждой плитки, чью товарную группу везут.
  suppliers: SupplierOffer[];
}

interface HubStats {
  hub: SupplierCatalogHub;
  categories: CategoryStats[];
  // Уникальные компании по всем плиткам хаба (без баз).
  total: number;
}


// «Подробнее» из каталога ведёт на страницу компании (/admin/suppliers/:id,
// шаг 3 плана закупок), а не в модалку: в каталоге человек смотрит на
// компанию целиком, и адрес такой страницы можно сохранить и переслать.
// Модалка остаётся запасным путём для карточек без supplier_id — их быть не
// должно (компанию проставляет триггер в базе), но терять кнопку из-за
// пропущенной связи нельзя. Из сравнения цен по-прежнему открывается
// модалка: там уход со страницы потерял бы таблицу сравнения (шаг 4).
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

// Ярлык категории для строки поиска — «домашняя» (по названию строки
// закупки) в приоритете, иначе первая категория, чья товарная группа есть
// на снимке сайта, иначе сырое название строки закупки (услуги вроде «ЭДО»,
// не входящие в каталог).
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

// Подпись страны для селектора — флаг остаётся в подписи (владелец,
// 2026-09-12: «вверху каталога выбор иконки флага»), а Select работает со
// строками, поэтому флаг живёт прямо в подписи, и обратно в страну её
// переводит countryByLabel.
function countryLabel(country: string): string {
  return `${countryFlag(country)} ${country}`;
}

function countryByLabel(label: string): string {
  return SUPPLIER_COUNTRIES.find((c) => countryLabel(c) === label) ?? SUPPLIER_COUNTRIES[0];
}

// Товарные группы плитки = зашитые в код + заведённые в базе на эту же
// плитку (см. lib/supplyCategoriesApi.ts). Складываем, а не заменяем:
// недоступная база должна означать «каталог как раньше», а не «каталог
// опустел».
function tileGroups(category: SupplierCatalogCategory, extraGroupsByTile: Map<string, string[]>): string[] {
  const extra = extraGroupsByTile.get(category.name);
  return extra && extra.length > 0 ? [...category.supplyGroups, ...extra] : category.supplyGroups;
}

export function SupplierCatalog({
  offers,
  requests,
  snapshotByHost,
  emails,
  quotes,
  orders,
  onOpenDetail,
  onAddSupplier,
}: {
  offers: SupplierOffer[];
  requests: SupplierRequest[];
  snapshotByHost: Map<string, SupplierSiteSnapshot>;
  // Для ранжирования «с кем уже работали» (заказы → КП → переписка).
  emails: SupplierOfferEmail[];
  quotes: SupplierQuote[];
  orders: PurchaseOrder[];
  onOpenDetail: (o: SupplierOffer) => void;
  // Завести поставщика руками — когда его нашли не веб-поиском, а по
  // знакомству или на выставке. До этого единственным способом добавить
  // карточку был автосбор.
  onAddSupplier: () => void;
}) {
  const [country, setCountry] = useState<string>(SUPPLIER_COUNTRIES[0]);
  const [search, setSearch] = useState('');
  const [hubName, setHubName] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  // Карточки без страны видны при любом флаге (см. комментарий выше) —
  // отфильтровать их молчаливо было бы потерей данных, а не удобством.
  // Карточки закупок по ведомости (request.ledgerId) — копии поставщиков,
  // заведённые под конкретную закупку; в каталоге у компании уже есть своя
  // карточка, копия дала бы дубль.
  const purchaseRequestIds = useMemo(() => new Set(requests.filter((r) => r.ledgerId).map((r) => r.id)), [requests]);
  const baseOffers = useMemo(
    () => offers.filter((o) => !purchaseRequestIds.has(o.requestId) && (!o.country.trim() || o.country === country)),
    [offers, country, purchaseRequestIds],
  );

  // Заводы и остальные (владелец, 2026-09-29: «видеть общее количество
  // заводов и обычных поставщиков и оставить в каталоге только заводы»).
  // Тип — из разбора сайта (suppliers.supplier_kind); завод здесь только
  // manufacturer: владелец марки сам не производит. Нет типа — «остальные».
  // С 2026-10-09 тот же запрос тянет бренды/ИНН/email для расширенного поиска.
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

  // Справочник из базы — чтобы группа, найденная при верификации живого
  // поставщика, попадала в свою плитку сразу, без ожидания публикации кода
  // (владелец, 2026-09-14). Ошибку глотаем молча: каталог тогда показывает
  // ровно то же, что показывал бы без базы, — группы из кода.
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
          // Каталог считает и показывает только верифицированных поставщиков
          // (владелец, 2026-09-13) — `verified: false` значит «нашли веб-
          // поиском, руками ещё не смотрели», такую карточку рано выводить
          // в счётчик плитки или в список.
          if (!o.verified) continue;
          const title = requestTitleById.get(o.requestId) ?? '';
          // Категория присваивается по ЛЮБОМУ из двух признаков — по новому
          // или старому названию строки закупки (LEGACY_REQUEST_TITLES) ИЛИ
          // по товарной группе со снимка сайта. Оба источника равноправны.
          // Гипермаркеты не исключение — у них просто обычно много групп
          // сразу, поэтому они естественно попадают в несколько плиток.
          const titleMatch = findCatalogCategory(title) === category;
          const hasGroup = offerGroups(o, snapshotByHost).some((g) => groups.has(g));
          if (!titleMatch && !hasGroup) continue;
          // Одна компания — одна строка: у неё бывают карточки в разных
          // категориях (рассылка по товару заводит копию в выбранной).
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

  // Поиск — плоский результат по всему каталогу (в рамках выбранной
  // страны), поверх навигации по хабам/категориям: владелец, 2026-09-12,
  // «справа от заголовка нужна строка поиска поставщика». С 2026-09-28 ищет
  // и по товару (разделы сайта). С 2026-10-09 — ещё по категории, бренду,
  // ИНН, email, телефону, менеджеру, сайту; сверху — совпадения с плитками.
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
      if (!match.matched) continue;
      if (o.supplierId && companies.has(o.supplierId)) continue;
      if (o.supplierId) companies.add(o.supplierId);
      results.push({
        offer: o,
        categoryLabel: catalogLabelFor(o, requestTitleById, snapshotByHost, extraGroupsByTile),
        byName: match.byName,
        hits: match.hits,
        reason: match.reason,
        kinds: match.kinds,
        tier: engagement.tierOf(o),
      });
    }
    // Сначала «с кем работали», потом совпадение по имени, потом по числу
    // разделов сайта, потом алфавит.
    return results.sort(
      (a, b) =>
        a.tier - b.tier ||
        Number(b.byName) - Number(a.byName) ||
        b.hits.length - a.hits.length ||
        a.offer.name.localeCompare(b.offer.name, 'ru'),
    );
  }, [countryOffers, requestTitleById, searchQuery, snapshotByHost, extraGroupsByTile, hintsById, engagement]);

  const openHub = (h: HubStats) => {
    setHubName(h.hub.name);
    setGroupFilter(null);
    // У универсальных промежуточного уровня нет — сразу список.
    setCategoryName(h.hub.categories.length === 1 ? h.hub.categories[0].name : null);
  };

  const crumb = (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <button type="button" className="text-primary-hover hover:underline" onClick={() => { setHubName(null); setCategoryName(null); setGroupFilter(null); }}>
        Каталог
      </button>
      {currentHub && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-ink-faint" />
          {currentCategory ? (
            <button type="button" className="text-primary-hover hover:underline" onClick={() => { setCategoryName(null); setGroupFilter(null); }}>
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
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-lg font-bold text-ink">Каталог поставщиков</span>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onAddSupplier} className="px-4 py-1.5 text-sm">
            <Plus className="h-4 w-4" />
            Добавить поставщика
          </Button>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название, бренд, ИНН, email, категория…"
            wrapperClassName="w-full max-w-[320px]"
          />
          {/* Владелец, 2026-09-15, второй заход: сперва две пилюли-кнопки
              заменили на ToggleGroup, но владелец хотел не «две страны рядом»,
              а «когда виден только активный вариант, а для переключения надо
              на него кликнуть и выбрать из выпадающего списка» — то есть Select
              (ui/Select, pill), а не ToggleGroup: тот по определению показывает
              все варианты сразу. Флаг остаётся частью подписи: Select работает
              со строками, поэтому options — подписи с флагом, а обратно в
              страну переводим countryByLabel. Значение по умолчанию —
              SUPPLIER_COUNTRIES[0], то есть Россия (см. data/supplierResearch.ts). */}
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
              'rounded-full px-3 py-1 transition-colors',
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
              <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">Категории</span>
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
                    }}
                    className="rounded-full border border-border bg-white/60 px-3 py-1.5 text-sm text-ink transition hover:border-primary"
                  >
                    {hit.kind === 'hub' ? hit.label : `${hit.hubName} · ${hit.label}`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <span className="text-sm text-ink-muted">
            {searchResults.length === 0 && navHits.length === 0
              ? `Ничего не нашлось по «${search.trim()}» — проверьте название, бренд, ИНН, email или категорию.`
              : searchResults.length === 0
                ? 'Компаний по запросу нет — выше совпали категории каталога.'
                : `Найдено ${searchResults.length} ${plural(searchResults.length, 'поставщик', 'поставщика', 'поставщиков')}.`}
          </span>
          {searchResults.map(({ offer, categoryLabel, byName, hits, reason, tier }) => (
            <div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border px-4 py-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-ink">{offer.name}</span>
                  {isFactory(offer) && <FactoryMark />}
                  <EngagementMark tier={tier} />
                  <span className="text-xs text-ink-faint">{categoryLabel}</span>
                </div>
                {!byName && (
                  <span className="text-xs text-ink-muted">
                    {hits.length > 0 ? (
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
                    ) : (
                      reason ?? 'совпадение по карточке'
                    )}
                  </span>
                )}
              </div>
              <OpenDetailButton offer={offer} onOpenDetail={onOpenDetail} />
            </div>
          ))}
        </div>
      ) : (
        <>
      {crumb}

      {/* Уровень 0: хабы */}
      {!currentHub && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hubs.map((h) => (
            <button
              key={h.hub.name}
              type="button"
              onClick={() => openHub(h)}
              className="flex min-h-[132px] flex-col justify-between gap-3 rounded-control border border-border bg-white/50 p-4 text-left transition hover:border-primary hover:bg-white/80"
            >
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-ink">{h.hub.name}</span>
                <span className="line-clamp-2 text-xs text-ink-faint">{h.hub.description}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-ink">{h.total}</span>
                <span className="text-xs text-ink-faint">{plural(h.total, 'компания', 'компании', 'компаний')} · {h.hub.categories.length} {plural(h.hub.categories.length, 'категория', 'категории', 'категорий')}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Уровень 1: категории хаба */}
      {currentHub && !currentCategory && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">{currentHub.hub.description}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {currentHub.categories.map((c) => (
              <button
                key={c.category.name}
                type="button"
                onClick={() => { setCategoryName(c.category.name); setGroupFilter(null); }}
                className="flex flex-col gap-3 rounded-control border border-border bg-white/50 p-4 text-left transition hover:border-primary hover:bg-white/80"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-semibold text-ink">{c.category.name}</span>
                  <Badge tone="neutral">{c.category.defaultComparisonMode === 'lot' ? 'поставка целиком' : 'по материалам'}</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.category.supplyGroups.slice(0, 4).map((g) => (
                    <span key={g} className="rounded-full border border-border px-2 py-0.5 text-xs text-ink-muted">{g}</span>
                  ))}
                  {c.category.supplyGroups.length > 4 && <span className="text-xs text-ink-faint">+{c.category.supplyGroups.length - 4}</span>}
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular-nums">
                  <span className="text-ink"><span className="text-xl font-semibold">{c.suppliers.length}</span> {plural(c.suppliers.length, 'поставщик', 'поставщика', 'поставщиков')}</span>
                  {c.suppliers.length === 0 && <Badge tone="warning">базу набирать</Badge>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Уровень 2: список компаний */}
      {currentCategory && (
        <CategoryView
          stats={currentCategory}
          groupFilter={groupFilter}
          onGroupFilter={setGroupFilter}
          snapshotByHost={snapshotByHost}
          onOpenDetail={onOpenDetail}
          isFactory={isFactory}
          engagement={engagement}
        />
      )}
        </>
      )}
    </Card>
  );
}

function CategoryView({
  stats,
  groupFilter,
  onGroupFilter,
  snapshotByHost,
  onOpenDetail,
  isFactory,
  engagement,
}: {
  stats: CategoryStats;
  groupFilter: string | null;
  onGroupFilter: (g: string | null) => void;
  snapshotByHost: Map<string, SupplierSiteSnapshot>;
  onOpenDetail: (o: SupplierOffer) => void;
  isFactory: (o: SupplierOffer) => boolean;
  engagement: CatalogEngagementIndex;
}) {
  const { category } = stats;
  const matchesFilter = (o: SupplierOffer) => !groupFilter || offerGroups(o, snapshotByHost).includes(groupFilter);
  const groupCount = (g: string) =>
    stats.suppliers.filter((o) => offerGroups(o, snapshotByHost).includes(g)).length;

  const row = (o: SupplierOffer) => (
    <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border px-4 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate font-medium text-ink">{o.name}</span>
        {isFactory(o) && <FactoryMark />}
        <EngagementMark tier={engagement.tierOf(o)} />
        {!o.country.trim() && <span className="text-xs text-ink-faint">страна не указана</span>}
      </div>
      <OpenDetailButton offer={o} onOpenDetail={onOpenDetail} />
    </div>
  );

  const suppliers = stats.suppliers.filter(matchesFilter);
  const empty = suppliers.length === 0;
  const withHistory = suppliers.filter((o) => engagement.tierOf(o) < 3).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink-muted">Что сюда входит: {category.includes.join('; ')}.</p>
        {category.supplyGroups.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => onGroupFilter(null)}
              className={cn('rounded-full border px-2.5 py-1 text-xs', groupFilter === null ? 'border-primary text-primary' : 'border-border text-ink-muted hover:border-primary')}
            >
              все группы
            </button>
            {category.supplyGroups.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onGroupFilter(groupFilter === g ? null : g)}
                className={cn('rounded-full border px-2.5 py-1 text-xs tabular-nums', groupFilter === g ? 'border-primary text-primary' : 'border-border text-ink-muted hover:border-primary')}
              >
                {g} · {groupCount(g)}
              </button>
            ))}
          </div>
        )}
      </div>

      {empty && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-faint">
          <Search className="h-4 w-4" />
          В базе пока никого — эту категорию придётся набирать веб-поиском из карточки категории ниже.
        </div>
      )}

      {suppliers.length > 0 && (
        <Section
          title={`Поставщики (${suppliers.length})`}
          hint={
            withHistory > 0
              ? `Сверху те, с кем уже были заказы, КП или переписка (${withHistory}). Дальше — остальные по алфавиту.`
              : 'По названию строки закупки или по товарной группе со снимка сайта — оба признака дают полноценное присвоение категории.'
          }
        >
          {suppliers.map((o) => row(o))}
        </Section>
      )}
    </div>
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
  // Не primary: нейтральный статус нельзя красить фирменным красным.
  const tone = tier === 0 ? 'success' : tier === 1 ? 'warning' : 'neutral';
  return <Badge tone={tone}>{label}</Badge>;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-ink">{title}</span>
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
