import { useMemo, useState, type ReactNode } from 'react';
import { Check, ExternalLink, FileDown, Link2, Pencil } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { ToggleGroup } from '../ui/ToggleGroup';
import { cn } from '../../lib/cn';
import { convertToUsd } from '../../lib/currencyConvert';
import { currencySymbols, type Currency } from '../../data/transactions';
import type { ExchangeRate } from '../../data/exchangeRates';
import type { EstimateMaterial } from '../../data/estimates';
import type { SupplierOfferEmail } from '../../data/supplierOfferEmails';
import type { SupplierQuote } from '../../data/supplierQuotes';
import {
  SUPPLIER_COUNTRIES,
  offerCommunicationStatus,
  type SupplierOffer,
  type SupplierProposal,
  type SupplierRequest,
} from '../../data/supplierResearch';
import { PURCHASE_ITEM_MATCH_KIND_LABELS, looksLikeDeliveryItem, purchaseItemTotal, type PurchaseItem, type PurchaseItemMatchKind } from '../../data/purchases';
import { updateSupplierRequestProposal } from '../../lib/supplierResearchApi';
import { getCurrentProfile } from '../../lib/accessProfile';
import { errorMessage } from '../../lib/errorMessage';

// Владелец, 2026-09-15: «Пришла пора разобраться со сравнением цен... исходя
// из этой страницы я ничего не понимаю». Старое сравнение группировало
// строки счетов по НАЗВАНИЮ позиции у поставщика — у каждого своя
// формулировка, поэтому в каждой группе оказывался один поставщик, один и
// тот же поставщик повторялся по числу присланных счетов, а сравнивались
// суммы строк (количество × цена в таре поставщика), несопоставимые между
// собой. Здесь единица сравнения — ПОЗИЦИЯ ВЕДОМОСТИ (материал раздела
// сметы, к которому привязан запрос), а не строка счёта:
//
//   строка счёта → sourceMaterialId (форма сопоставления в переписке)
//   цена за единицу сметы (unitPrice, с НДС) × объём ведомости = стоимость
//   покрытия — одинаковый объём у всех, суммы сопоставимы.
//
// Таблица: строки — позиции ведомости, столбцы — поставщики, приславшие КП.
// На пару «позиция × поставщик» берётся ПОСЛЕДНЯЯ по времени строка с ценой
// из его счетов (обновлённый счёт вытесняет старый сам собой; наша же
// ведомость, распознанная как счёт без цен, ничего не вытесняет).
//
// Минимума цены здесь нет намеренно (владелец, тем же днём: «минимальную
// цену не показывай, он считает по аналогам, которые не подойдут. Я отберу
// позиции на утверждение и уже от них посчитаешь сумму поставки») —
// зелёным подсвечено только то, что человек отобрал кнопкой «Выбрать»
// (SupplierRequest.proposal), сумма считается только по отобранному, и
// именно это уходит в лист согласования и PDF руководителю стройки.

const KIND_TONE: Record<PurchaseItemMatchKind, string> = {
  exact: 'bg-success-bg text-success',
  alternative: 'bg-warning-bg text-warning',
  check: 'bg-danger-bg text-danger',
  delivery: 'bg-surface-muted text-ink-muted',
};

interface Cell {
  offerId: string;
  itemId: string;
  quoteTitle: string;
  unitPrice: number;
  currency: Currency;
  kind: PurchaseItemMatchKind;
  note: string;
  productUrl: string;
  usdUnit: number | null;
}

interface Column {
  offer: SupplierOffer;
  cells: Map<string, Cell>;
  // Сумма строк-доставок из последнего счёта (null — в счёте доставки нет).
  delivery: number | null;
  // Строки последнего счёта, не привязанные ни к позиции, ни к доставке.
  unmatched: PurchaseItem[];
  quotesCount: number;
}

// «м²» в смете и «м2»/«кв.м»/«m2» в счёте — одна и та же единица;
// распознавание счёта пишет как в документе, смета — как ввёл человек.
function normalizeUnit(u: string): string {
  return u
    .trim()
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\s+|\./g, '')
    .replace(/^кв\.?м$|^квм$|^sqm$|^m2$/i, 'м2')
    .replace(/^m3$|^кубм$/i, 'м3')
    .replace(/^шт\.?$|^pcs$|^pc$/i, 'шт');
}

function sameUnit(a: string, b: string): boolean {
  const na = normalizeUnit(a);
  const nb = normalizeUnit(b);
  return na.length > 0 && na === nb;
}

// Цена за единицу сметы: введённая руками при сопоставлении, а без неё —
// цена строки, если единица счёта буквально совпадает с единицей сметы
// (тогда одна «единица» счёта и правда одна единица сметы, см.
// computeUnitPriceGuess в SupplierCorrespondenceTab).
function unitPriceOf(item: PurchaseItem, position: EstimateMaterial): number | null {
  if (item.unitPrice != null && item.unitPrice > 0) return item.unitPrice;
  if (item.price != null && item.price > 0 && sameUnit(item.unit, position.unit)) return item.price;
  return null;
}

function isDeliveryItem(item: PurchaseItem): boolean {
  return item.matchKind === 'delivery' || (!item.sourceMaterialId && looksLikeDeliveryItem(item.name));
}

function buildColumns(
  offers: SupplierOffer[],
  quotesByOffer: Map<string, SupplierQuote[]>,
  positions: EstimateMaterial[],
  rate: ExchangeRate | undefined,
): Column[] {
  const byId = new Map(positions.map((p) => [p.id, p]));
  return offers.map((offer) => {
    const quotes = quotesByOffer.get(offer.id) ?? [];
    // Счета — в хронологии, чтобы последняя цена перекрывала прежнюю. Без
    // строк КП (старые карточки, до 2026-09-11) — позиции самой карточки.
    const sources: { title: string; items: PurchaseItem[]; currency: Currency }[] =
      quotes.length > 0
        ? quotes.map((q) => ({ title: q.title, items: q.items, currency: q.currency }))
        : [{ title: 'Позиции карточки', items: offer.items, currency: offer.currency }];
    const cells = new Map<string, Cell>();
    let delivery: number | null = null;
    let unmatched: PurchaseItem[] = [];
    for (const src of sources) {
      let srcDelivery: number | null = null;
      const srcUnmatched: PurchaseItem[] = [];
      let priced = false;
      for (const item of src.items) {
        if (isDeliveryItem(item)) {
          const total = purchaseItemTotal(item) || item.price || 0;
          if (total > 0) srcDelivery = (srcDelivery ?? 0) + total;
          continue;
        }
        const position = item.sourceMaterialId ? byId.get(item.sourceMaterialId) : undefined;
        if (!position) {
          if (item.price != null && item.price > 0) srcUnmatched.push(item);
          continue;
        }
        const unitPrice = unitPriceOf(item, position);
        if (unitPrice == null) continue;
        priced = true;
        cells.set(position.id, {
          offerId: offer.id,
          itemId: item.id,
          quoteTitle: src.title,
          unitPrice,
          currency: src.currency,
          kind: item.matchKind && item.matchKind !== 'delivery' ? item.matchKind : 'exact',
          note: item.matchNote ?? '',
          productUrl: item.productUrl ?? '',
          usdUnit: convertToUsd(unitPrice, src.currency, rate),
        });
      }
      // Доставку и несопоставленные строки берём из последнего счёта, где
      // вообще были цены: наша ведомость, распознанная как «счёт» без цен,
      // не должна стирать доставку из настоящего счёта.
      if (priced || srcDelivery != null || srcUnmatched.length > 0) {
        delivery = srcDelivery;
        unmatched = srcUnmatched;
      }
    }
    return { offer, cells, delivery, unmatched, quotesCount: quotes.length };
  });
}

function formatMoney(amount: number, currency: Currency): string {
  const formatted = Math.round(amount).toLocaleString('ru-RU');
  const symbol = currencySymbols[currency];
  return currency === 'USD' ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

function formatUnit(amount: number, currency: Currency): string {
  const formatted = (Math.round(amount * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const symbol = currencySymbols[currency];
  return currency === 'USD' ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

// Сумма набора «сумма в валюте» → одна строка: если валюта одна — в ней,
// иначе в долларах по курсу дня (два поставщика из разных стран в одном
// отборе — редкость, но не ошибка).
function sumMoney(parts: { amount: number; currency: Currency }[], rate: ExchangeRate | undefined): string {
  if (parts.length === 0) return '—';
  const currencies = new Set(parts.map((p) => p.currency));
  if (currencies.size === 1) {
    const currency = parts[0].currency;
    return formatMoney(parts.reduce((a, p) => a + p.amount, 0), currency);
  }
  let usd = 0;
  for (const p of parts) {
    const v = convertToUsd(p.amount, p.currency, rate);
    if (v == null) return 'разные валюты, нет курса';
    usd += v;
  }
  return formatMoney(usd, 'USD');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function KindTag({ kind }: { kind: PurchaseItemMatchKind }) {
  return (
    <span className={cn('inline-block rounded-full px-1.5 py-px text-[10.5px] font-semibold leading-relaxed', KIND_TONE[kind])}>
      {kind === 'exact' ? 'ровно' : PURCHASE_ITEM_MATCH_KIND_LABELS[kind]}
    </span>
  );
}

export function PriceComparisonCard({
  request,
  positions,
  offers,
  emails,
  quotes,
  rate,
  onOpenDetail,
  onProposalSaved,
  renderBadges,
}: {
  request: SupplierRequest;
  // Материалы раздела сметы, к которому привязан запрос, — то, что реально
  // рассылалось поставщикам как ведомость (см. lib/ledgerSync.ts).
  positions: EstimateMaterial[];
  offers: SupplierOffer[];
  emails: SupplierOfferEmail[];
  quotes: SupplierQuote[];
  rate: ExchangeRate | undefined;
  onOpenDetail: (o: SupplierOffer) => void;
  onProposalSaved: (r: SupplierRequest) => void;
  // Бейджи верификации/благонадёжности живут в Suppliers.tsx вместе со своим
  // состоянием — сюда приходят готовыми.
  renderBadges: (o: SupplierOffer) => ReactNode;
}) {
  const [country, setCountry] = useState<string>(SUPPLIER_COUNTRIES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offersInCountry = offers.filter((o) => (o.country || SUPPLIER_COUNTRIES[0]) === country);
  const confirmed = offersInCountry.filter((o) => offerCommunicationStatus(o, emails) === 'confirmed');

  const quotesByOffer = useMemo(() => {
    const map = new Map<string, SupplierQuote[]>();
    [...quotes]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((q) => map.set(q.offerId, [...(map.get(q.offerId) ?? []), q]));
    return map;
  }, [quotes]);

  const columns = useMemo(() => {
    const cols = buildColumns(confirmed, quotesByOffer, positions, rate);
    // Порядок столбцов — по числу закрытых позиций, потом по имени; от цены
    // не зависит (см. шапку файла про минимум).
    return cols.sort((a, b) => b.cells.size - a.cells.size || a.offer.name.localeCompare(b.offer.name, 'ru'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed.map((o) => o.id + o.items.length).join(','), quotesByOffer, positions, rate]);

  // Воронка запроса — по всем поставщикам выбранной страны, не только по
  // приславшим КП (владелец: «сколько отправлено — главная отправная точка»).
  const funnel = useMemo(() => {
    const ids = new Set(offersInCountry.map((o) => o.id));
    const mine = emails.filter((e) => ids.has(e.offerId));
    const out = mine.filter((e) => e.direction === 'out');
    const inbound = mine.filter((e) => e.direction === 'in');
    const sentIds = new Set(out.map((e) => e.offerId));
    const repliedIds = new Set(inbound.map((e) => e.offerId));
    const dates = mine.map((e) => e.createdAt).sort();
    const quotesCount = confirmed.reduce((a, o) => a + (quotesByOffer.get(o.id)?.length ?? 0), 0);
    const pricedPositions = positions.filter((p) => columns.some((c) => c.cells.has(p.id))).length;
    return {
      sent: sentIds.size,
      letters: out.length,
      replied: repliedIds.size,
      repliedNoQuote: [...repliedIds].filter((id) => !confirmed.some((o) => o.id === id)).length,
      confirmed: confirmed.length,
      quotesCount,
      pricedPositions,
      first: dates[0] ?? null,
      last: dates.length > 0 ? dates[dates.length - 1] : null,
    };
  }, [offersInCountry, emails, confirmed, quotesByOffer, positions, columns]);

  const proposal = request.proposal ?? {};
  const columnById = new Map(columns.map((c) => [c.offer.id, c]));

  // Отобранное: позиция → ячейка. Отбор, сделанный по строке, которой уже
  // нет (счёт удалили/пересопоставили), не считается — но и не стирается
  // сам по себе, человек увидит пустую позицию и выберет заново.
  const picked = positions.map((p) => {
    const pick = proposal[p.id];
    const cell = pick ? columnById.get(pick.offerId)?.cells.get(p.id) : undefined;
    return { position: p, cell: cell && cell.itemId === pick?.itemId ? cell : cell ?? null };
  });
  const pickedCells = picked.filter((x): x is { position: EstimateMaterial; cell: Cell } => !!x.cell);
  const pickedOfferIds = new Set(pickedCells.map((x) => x.cell.offerId));
  const pickedParts = pickedCells.map((x) => ({ amount: x.cell.unitPrice * (x.position.quantity ?? 0), currency: x.cell.currency }));
  const pickedDelivery = [...pickedOfferIds]
    .map((id) => columnById.get(id))
    .filter((c): c is Column => !!c && c.delivery != null)
    .map((c) => ({ amount: c.delivery!, currency: c.offer.currency }));
  const kinds = pickedCells.reduce(
    (acc, x) => ({ ...acc, [x.cell.kind]: (acc[x.cell.kind] ?? 0) + 1 }),
    {} as Partial<Record<PurchaseItemMatchKind, number>>,
  );

  async function saveProposal(next: SupplierProposal) {
    setSaving(true);
    setError(null);
    try {
      onProposalSaved(await updateSupplierRequestProposal(request.id, next));
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить отбор'));
    } finally {
      setSaving(false);
    }
  }

  function togglePick(positionId: string, cell: Cell) {
    const next = { ...proposal };
    if (next[positionId]?.offerId === cell.offerId) delete next[positionId];
    else next[positionId] = { offerId: cell.offerId, itemId: cell.itemId };
    void saveProposal(next);
  }

  function toggleColumn(col: Column) {
    const all = [...col.cells.keys()].every((pid) => proposal[pid]?.offerId === col.offer.id);
    const next = { ...proposal };
    col.cells.forEach((cell, pid) => {
      if (all) delete next[pid];
      else next[pid] = { offerId: col.offer.id, itemId: cell.itemId };
    });
    void saveProposal(next);
  }

  // Владелец, 2026-09-15: «чтобы эту страницу можно было выгрузить как PDF,
  // чтобы я смог скинуть руководителю стройки на утверждение» — печатаем
  // карточку в отдельном окне со стилями страницы (A4 альбомная), браузер
  // сам предлагает «Сохранить как PDF». Кнопки и переключатели (.no-print)
  // в печать не попадают.
  function exportPdf(cardEl: HTMLElement | null) {
    if (!cardEl) return;
    const win = window.open('', '_blank', 'width=1200,height=800');
    if (!win) {
      setError('Браузер заблокировал окно печати — разрешите всплывающие окна для этого сайта.');
      return;
    }
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((n) => n.outerHTML)
      .join('\n');
    win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${request.title} — сравнение КП</title>${styles}
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { background: #fff !important; padding: 0 !important; }
        .no-print { display: none !important; }
        .print-root { box-shadow: none !important; border-radius: 8px; }
        table { font-size: 10px; } th, td { padding: 4px 6px !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      </style></head><body>${cardEl.outerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  const emptyPositions = positions.length === 0;
  const unmatchedAll = columns.flatMap((c) => c.unmatched.map((item) => ({ item, offer: c.offer })));

  return (
    <Card className="print-root flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-bold text-ink">{request.title}</div>
          <p className="mt-0.5 text-xs text-ink-muted">
            {request.sectionTitle ? `Раздел сметы «${request.sectionTitle}», ` : ''}
            {positions.length} поз.
            {positions.length > 0 && ` · цены за единицу сметы с НДС × объём ведомости`}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <ToggleGroup options={[...SUPPLIER_COUNTRIES]} value={country} onChange={setCountry} />
          {Object.keys(proposal).length > 0 && (
            <Button type="button" variant="ghost" onClick={() => void saveProposal({})} disabled={saving}>
              Очистить отбор
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            icon={<FileDown className="h-4 w-4" />}
            onClick={(e) => exportPdf((e.currentTarget as HTMLElement).closest('.print-root'))}
          >
            Скачать PDF
          </Button>
        </div>
      </div>

      {/* Воронка запроса */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-border bg-border md:grid-cols-4">
        {[
          { n: funnel.sent, sub: funnel.letters ? `${funnel.letters} писем с напоминаниями` : 'писем ещё не было', label: 'Запрос отправлен' },
          { n: funnel.replied, sub: `${funnel.repliedNoQuote} без КП`, label: 'Ответили' },
          { n: funnel.confirmed, sub: `${funnel.quotesCount} счетов`, label: 'КП получено' },
          { n: `${funnel.pricedPositions} из ${positions.length}`, sub: positions.length ? 'позиций ведомости с ценой' : 'раздел сметы не привязан', label: 'Позиций с ценой', final: true },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 bg-surface px-4 py-3">
            <span className={cn('text-2xl font-bold tabular-nums leading-tight', s.final ? 'text-success' : 'text-ink')}>{s.n}</span>
            <span className="text-sm font-semibold text-ink">{s.label}</span>
            <span className="text-xs text-ink-muted">{s.sub}</span>
          </div>
        ))}
      </div>
      {funnel.first && funnel.last && (
        <p className="-mt-2 text-xs text-ink-faint">
          Первое письмо {formatDate(funnel.first)}, последнее {formatDate(funnel.last)}
        </p>
      )}

      {/* Плашки — только про отобранное */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={cn('flex flex-col gap-0.5 rounded-control border px-4 py-3', pickedCells.length > 0 ? 'border-success/30 bg-success-bg' : 'border-border bg-surface-muted')}>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">На утверждение</span>
          <span className={cn('text-xl font-bold tabular-nums', pickedCells.length > 0 ? 'text-success' : 'text-ink-faint')}>
            {pickedCells.length > 0 ? sumMoney([...pickedParts, ...pickedDelivery], rate) : '—'}
          </span>
          <span className="text-xs text-ink-muted">
            {pickedCells.length > 0
              ? `${pickedCells.length} из ${positions.length} позиций, поставщиков: ${pickedOfferIds.size}${pickedDelivery.length ? ', доставка включена' : ''}`
              : 'нажмите «Выбрать» у нужной цены в таблице'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-control border border-border bg-surface-muted px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Соответствие ведомости</span>
          <span className="text-xl font-bold tabular-nums text-ink">
            {kinds.exact ?? 0} <span className="text-xs font-medium text-ink-muted">ровно</span> · {kinds.alternative ?? 0}{' '}
            <span className="text-xs font-medium text-ink-muted">аналог</span> · {kinds.check ?? 0} <span className="text-xs font-medium text-ink-muted">уточнить</span>
          </span>
          <span className="text-xs text-ink-muted">
            {kinds.check ? 'по позициям «уточнить» нужен ответ поставщика до заказа' : kinds.alternative ? 'аналоги согласовать по карточкам товара' : 'среди отобранного всё ровно по ведомости'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-control border border-border bg-surface-muted px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Без выбора</span>
          <span className="text-xl font-bold tabular-nums text-ink">
            {positions.length - pickedCells.length} <span className="text-xs font-medium text-ink-muted">из {positions.length}</span>
          </span>
          <span className="truncate text-xs text-ink-muted">
            {positions.length - pickedCells.length > 0
              ? picked.filter((x) => !x.cell).map((x) => x.position.name).join('; ')
              : 'по каждой позиции выбран поставщик'}
          </span>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {emptyPositions ? (
        <p className="text-sm text-ink-faint">
          У категории не выбран раздел сметы (или в нём нет материалов) — сравнение строится по позициям ведомости.
          Укажите смету и раздел в настройках категории на вкладке «Поставщики».
        </p>
      ) : columns.length === 0 ? (
        <p className="text-sm text-ink-faint">Пока никто из «{country}» не прислал КП — переключите страну выше.</p>
      ) : (
        <div className="overflow-x-auto rounded-control border border-border">
          <table className="w-full min-w-[900px] border-collapse text-sm tabular-nums">
            <thead>
              <tr className="bg-surface-muted text-left text-xs text-ink-muted">
                <th className="min-w-[240px] px-3 py-2 font-medium">Позиция ведомости</th>
                {columns.map((col) => {
                  const mine = [...col.cells.keys()].filter((pid) => proposal[pid]?.offerId === col.offer.id).length;
                  const all = col.cells.size;
                  return (
                    <th key={col.offer.id} className={cn('min-w-[180px] px-3 py-2 align-top font-medium', mine > 0 && 'bg-success-bg shadow-[inset_0_3px_0_var(--color-success)]')}>
                      <span className="block text-[13px] font-bold text-ink">{col.offer.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">{renderBadges(col.offer)}</span>
                      <span className="mt-1 block text-[11px] font-normal text-ink-faint">
                        {col.quotesCount > 1 ? `${col.quotesCount} ${col.quotesCount < 5 ? 'счёта' : 'счетов'}, в таблице последние цены` : col.quotesCount === 1 ? '1 счёт' : 'позиции карточки'}
                      </span>
                      {all > 0 && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => toggleColumn(col)}
                          className={cn(
                            'no-print mt-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                            mine === all ? 'border-success bg-success text-white' : 'border-border-strong bg-surface text-ink hover:border-success hover:text-success',
                          )}
                        >
                          {mine === all ? `✓ Выбраны все ${all}` : `Выбрать все ${all}`}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-t border-border align-top">
                  <td className="px-3 py-2.5">
                    <span className="block font-semibold text-ink">{p.name}</span>
                    {p.note && <span className="line-clamp-2 block text-xs text-ink-muted" title={p.note}>{p.note}</span>}
                    <span className="mt-1 inline-block rounded-full border border-border bg-surface-muted px-2 py-px text-xs font-semibold text-ink">
                      {p.quantity != null ? p.quantity.toLocaleString('ru-RU') : '—'} {p.unit}
                    </span>
                  </td>
                  {columns.map((col) => {
                    const cell = col.cells.get(p.id);
                    if (!cell) {
                      return (
                        <td key={col.offer.id} className="px-3 py-2.5 text-ink-faint">
                          —<span className="block text-xs">не предложено</span>
                        </td>
                      );
                    }
                    const isPicked = proposal[p.id]?.offerId === col.offer.id;
                    return (
                      <td key={col.offer.id} className={cn('px-3 py-2.5', isPicked && 'bg-success-bg shadow-[inset_3px_0_0_var(--color-success)]')}>
                        <button
                          type="button"
                          onClick={() => onOpenDetail(col.offer)}
                          title={`Открыть счёт: ${cell.quoteTitle}`}
                          className={cn('block text-left font-semibold hover:underline', isPicked ? 'text-success' : 'text-ink')}
                        >
                          {formatUnit(cell.unitPrice, cell.currency)}
                          <span className="text-[11px] font-medium text-ink-faint"> / {p.unit || 'ед.'}</span>
                        </button>
                        {p.quantity != null && (
                          <span className="block text-xs text-ink-muted">{formatMoney(cell.unitPrice * p.quantity, cell.currency)} на объём</span>
                        )}
                        <span className="mt-1 block text-[11.5px] leading-snug text-ink">
                          <KindTag kind={cell.kind} /> {cell.note}
                        </span>
                        {cell.productUrl && (
                          <a
                            href={/^https?:\/\//.test(cell.productUrl) ? cell.productUrl : `https://${cell.productUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary-hover hover:underline"
                          >
                            <Link2 className="h-3 w-3" /> карточка товара
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => togglePick(p.id, cell)}
                          className={cn(
                            'no-print mt-1.5 block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                            isPicked ? 'border-success bg-success text-white' : 'border-border-strong bg-surface text-ink hover:border-success hover:text-success',
                          )}
                        >
                          {isPicked ? '✓ Отобрано' : 'Выбрать'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-muted text-xs">
              <tr className="border-t border-border align-top">
                <td className="px-3 py-2 font-semibold text-ink">
                  Наличие и условия
                  <span className="block font-normal text-ink-muted">из писем менеджеров, правится в карточке</span>
                </td>
                {columns.map((col) => (
                  <td key={col.offer.id} className="px-3 py-2 text-ink">
                    {col.offer.termsNote || <span className="text-ink-faint">не указано</span>}
                    <button type="button" onClick={() => onOpenDetail(col.offer)} className="no-print ml-1 inline-flex align-middle text-ink-faint hover:text-ink" title="Изменить в карточке">
                      <Pencil className="h-3 w-3" />
                    </button>
                  </td>
                ))}
              </tr>
              <tr className="border-t border-border align-top">
                <td className="px-3 py-2 font-semibold text-ink">Доставка</td>
                {columns.map((col) => (
                  <td key={col.offer.id} className="px-3 py-2 text-ink">
                    {col.delivery != null ? formatMoney(col.delivery, col.offer.currency) : <span className="text-ink-faint">в счёте нет</span>}
                  </td>
                ))}
              </tr>
              <tr className="border-t-2 border-border-strong align-top text-sm">
                <td className="px-3 py-2 font-bold text-ink">
                  Отобрано у поставщика
                  <span className="block text-xs font-normal text-ink-muted">объём ведомости × цена, с НДС</span>
                </td>
                {columns.map((col) => {
                  const mine = positions.filter((p) => proposal[p.id]?.offerId === col.offer.id && col.cells.has(p.id));
                  if (mine.length === 0) {
                    return (
                      <td key={col.offer.id} className="px-3 py-2 text-ink-faint">
                        —<span className="block text-xs">ничего не отобрано</span>
                      </td>
                    );
                  }
                  const parts = mine.map((p) => ({ amount: col.cells.get(p.id)!.unitPrice * (p.quantity ?? 0), currency: col.cells.get(p.id)!.currency }));
                  if (col.delivery != null) parts.push({ amount: col.delivery, currency: col.offer.currency });
                  return (
                    <td key={col.offer.id} className="bg-success-bg px-3 py-2 font-bold text-success shadow-[inset_3px_0_0_var(--color-success)]">
                      {sumMoney(parts, rate)}
                      <span className="block text-xs font-normal text-ink-muted">
                        {mine.length} из {positions.length} позиций{col.delivery != null ? ', с доставкой' : ''}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!emptyPositions && columns.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded-sm border border-border bg-success-bg shadow-[inset_2px_0_0_var(--color-success)]" /> отобрано на утверждение
          </span>
          <span className="inline-flex items-center gap-1.5"><KindTag kind="exact" /> та же позиция, что в ведомости</span>
          <span className="inline-flex items-center gap-1.5"><KindTag kind="alternative" /> другой артикул или бренд</span>
          <span className="inline-flex items-center gap-1.5"><KindTag kind="check" /> расхождение, нужен ответ поставщика</span>
          <span className="no-print">Цена ведёт в карточку поставщика, вид и ссылка задаются при сопоставлении счёта</span>
        </div>
      )}

      {/* Лист согласования — только когда есть что согласовывать */}
      {pickedCells.length > 0 && (
        <div className="flex flex-col gap-3 rounded-control border border-border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Лист согласования</span>
              <span className="text-base font-bold text-ink">{request.title}: предложение на утверждение</span>
            </div>
            <span className="text-xl font-bold tabular-nums text-success">{sumMoney([...pickedParts, ...pickedDelivery], rate)}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
            <table className="w-full border-collapse text-xs tabular-nums">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
                  <th className="py-1 pr-2 font-medium">Позиция</th>
                  <th className="py-1 pr-2 font-medium">Поставщик</th>
                  <th className="py-1 pr-2 text-right font-medium">Цена</th>
                  <th className="py-1 text-right font-medium">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {picked.map(({ position, cell }) => (
                  <tr key={position.id} className="border-t border-border align-top">
                    <td className="py-1.5 pr-2">
                      <span className="font-medium text-ink">{position.name}</span>
                      {cell?.note && <span className="block text-ink-muted">{cell.note}</span>}
                      {cell?.productUrl && (
                        <a href={cell.productUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-hover hover:underline">
                          <ExternalLink className="h-3 w-3" /> карточка
                        </a>
                      )}
                    </td>
                    {cell ? (
                      <>
                        <td className="py-1.5 pr-2 text-ink">
                          {columnById.get(cell.offerId)?.offer.name}
                          <span className="block"><KindTag kind={cell.kind} /></span>
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-2 text-right text-ink">{formatUnit(cell.unitPrice, cell.currency)}</td>
                        <td className="whitespace-nowrap py-1.5 text-right font-semibold text-ink">
                          {formatMoney(cell.unitPrice * (position.quantity ?? 0), cell.currency)}
                        </td>
                      </>
                    ) : (
                      <td colSpan={3} className="py-1.5 text-ink-faint">не отобрано</td>
                    )}
                  </tr>
                ))}
                {pickedDelivery.length > 0 && (
                  <tr className="border-t border-border">
                    <td className="py-1.5 pr-2 text-ink" colSpan={3}>Доставка ({[...pickedOfferIds].filter((id) => columnById.get(id)?.delivery != null).map((id) => columnById.get(id)!.offer.name).join(', ')})</td>
                    <td className="whitespace-nowrap py-1.5 text-right font-semibold text-ink">{sumMoney(pickedDelivery, rate)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-xs">
              <div>
                <div className="min-h-[30px] border-b border-border-strong pb-1 text-ink">{getCurrentProfile()?.displayName || 'Бэкофис'}</div>
                <div className="mt-1 text-[10.5px] uppercase tracking-wide text-ink-faint">Подготовил</div>
              </div>
              <div>
                <div className="min-h-[30px] border-b border-border-strong pb-1 text-ink">{new Date().toLocaleDateString('ru-RU')}</div>
                <div className="mt-1 text-[10.5px] uppercase tracking-wide text-ink-faint">Дата</div>
              </div>
              <div>
                <div className="min-h-[30px] border-b border-border-strong pb-1" />
                <div className="mt-1 text-[10.5px] uppercase tracking-wide text-ink-faint">Руководитель стройки, подпись</div>
              </div>
              <div>
                <div className="min-h-[30px] border-b border-border-strong pb-1" />
                <div className="mt-1 text-[10.5px] uppercase tracking-wide text-ink-faint">Дата</div>
              </div>
              <div className="col-span-2">
                <div className="min-h-[30px] border-b border-border-strong pb-1" />
                <div className="mt-1 text-[10.5px] uppercase tracking-wide text-ink-faint">Решение: утвердить / вернуть на уточнение, комментарий</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Строки счетов, которые ещё не привязаны к ведомости, — чтобы ничего не терялось молча */}
      {unmatchedAll.length > 0 && (
        <details className="no-print group">
          <summary className="cursor-pointer text-xs font-medium text-ink-muted">
            Не привязано к ведомости: {unmatchedAll.length} строк счетов — сопоставьте в переписке, чтобы они попали в таблицу
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {unmatchedAll.map(({ item, offer }) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate text-ink">
                  <span className="font-medium">{offer.name}:</span> {item.name}
                  {item.quantity != null && ` · ${item.quantity} ${item.unit}`}
                </span>
                <span className="tabular-nums text-ink-muted">{item.price != null ? formatUnit(item.price, offer.currency) : ''}</span>
                <button type="button" onClick={() => onOpenDetail(offer)} className="inline-flex items-center gap-1 font-semibold text-primary-hover hover:underline">
                  <Check className="h-3 w-3" /> Сопоставить
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
