import { convertToUsd } from '../../lib/currencyConvert';
import { currencySymbols, type Currency } from '../../data/transactions';
import type { ExchangeRate } from '../../data/exchangeRates';
import type { Estimate, EstimateMaterial, EstimateSection } from '../../data/estimates';
import type { QuoteTerms, SupplierQuote } from '../../data/supplierQuotes';
import type { SupplierOffer, SupplierProposal, SupplierProposalSnapshot, SupplierRequest } from '../../data/supplierResearch';
import { looksLikeDeliveryItem, purchaseItemTotal, type PurchaseItem, type PurchaseItemMatchKind } from '../../data/purchases';
import { sameUnit } from '../../lib/units';

// Расчётная часть «Сравнения цен» (см. шапку PriceComparisonCard.tsx про
// принцип: позиция ведомости × поставщик, цена за единицу сметы × объём).
// Вынесена из компонента, чтобы одни и те же числа шли на экран, в PDF и
// в письмо руководителю стройки (priceComparisonPrint.ts).

export interface Cell {
  offerId: string;
  itemId: string;
  // КП, из которого взята строка (null — позиции карточки без КП).
  quoteId: string | null;
  quoteTitle: string;
  quoteDate: string | null;
  unitPrice: number;
  currency: Currency;
  kind: PurchaseItemMatchKind;
  note: string;
  productUrl: string;
  // Уверенность автосопоставления (шаг 5 плана закупок), 0…1. null — строку
  // сопоставлял человек либо счёт распознан до появления автосопоставления:
  // в обоих случаях это НЕ «низкая уверенность», и помечать такую ячейку
  // «проверить» не за что.
  matchConfidence: number | null;
  usdUnit: number | null;
  // Как в счёте: объём и единица поставщика (владелец, 2026-09-15:
  // Keramogranit.ru посчитал 713 м² из 992 — ячейка должна это показывать).
  quotedQuantity: number | null;
  quotedUnit: string;
}

export interface UnmatchedLine {
  item: PurchaseItem;
  quoteId: string | null;
  quoteTitle: string;
}

export interface Column {
  offer: SupplierOffer;
  cells: Map<string, Cell>;
  // Сумма строк-доставок из последнего счёта (null — в счёте доставки нет).
  delivery: number | null;
  // Строки последнего счёта с ценой, не привязанные ни к позиции, ни к доставке.
  unmatched: UnmatchedLine[];
  quotesCount: number;
  lastQuoteAt: string | null;
  // Условия последнего КП (шаг 6 плана закупок): срок, предоплата, НДС,
  // доставка словами. Показываются в шапке столбца — там, где сравнивают.
  terms: QuoteTerms | null;
}

// Цена за единицу сметы: введённая руками при сопоставлении, а без неё —
// цена строки, если единица счёта буквально совпадает с единицей сметы.
export function unitPriceOf(item: PurchaseItem, position: EstimateMaterial): number | null {
  if (item.unitPrice != null && item.unitPrice > 0) return item.unitPrice;
  if (item.price != null && item.price > 0 && sameUnit(item.unit, position.unit)) return item.price;
  return null;
}

export function isDeliveryItem(item: PurchaseItem): boolean {
  return item.matchKind === 'delivery' || (!item.sourceMaterialId && looksLikeDeliveryItem(item.name));
}

export function buildColumns(
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
    const sources: {
      id: string | null;
      title: string;
      items: PurchaseItem[];
      currency: Currency;
      date: string | null;
      terms: QuoteTerms | null;
    }[] =
      quotes.length > 0
        ? quotes.map((q) => ({ id: q.id, title: q.title, items: q.items, currency: q.currency, date: q.createdAt, terms: q.terms }))
        : [{ id: null, title: 'Позиции карточки', items: offer.items, currency: offer.currency, date: null, terms: null }];
    const cells = new Map<string, Cell>();
    let delivery: number | null = null;
    let unmatched: UnmatchedLine[] = [];
    let lastQuoteAt: string | null = null;
    let terms: QuoteTerms | null = null;
    for (const src of sources) {
      let srcDelivery: number | null = null;
      const srcUnmatched: UnmatchedLine[] = [];
      let priced = false;
      for (const item of src.items) {
        if (isDeliveryItem(item)) {
          const total = purchaseItemTotal(item) || item.price || 0;
          if (total > 0) srcDelivery = (srcDelivery ?? 0) + total;
          continue;
        }
        const position = item.sourceMaterialId ? byId.get(item.sourceMaterialId) : undefined;
        if (!position) {
          if (item.price != null && item.price > 0) srcUnmatched.push({ item, quoteId: src.id, quoteTitle: src.title });
          continue;
        }
        const unitPrice = unitPriceOf(item, position);
        if (unitPrice == null) {
          // Привязана, но цену за единицу сметы никто не посчитал — для
          // человека это тоже «не привязано до конца».
          if (item.price != null && item.price > 0) srcUnmatched.push({ item, quoteId: src.id, quoteTitle: src.title });
          continue;
        }
        priced = true;
        cells.set(position.id, {
          offerId: offer.id,
          itemId: item.id,
          quoteId: src.id,
          quoteTitle: src.title,
          quoteDate: src.date,
          unitPrice,
          currency: src.currency,
          kind: item.matchKind && item.matchKind !== 'delivery' ? item.matchKind : 'exact',
          note: item.matchNote ?? '',
          productUrl: item.productUrl ?? '',
          matchConfidence: typeof item.matchConfidence === 'number' ? item.matchConfidence : null,
          usdUnit: convertToUsd(unitPrice, src.currency, rate),
          quotedQuantity: item.quantity,
          quotedUnit: item.unit,
        });
      }
      // Доставку и несопоставленные строки берём из последнего счёта, где
      // вообще были цены: наша ведомость, распознанная как «счёт» без цен,
      // не должна стирать доставку из настоящего счёта.
      if (priced || srcDelivery != null || srcUnmatched.length > 0) {
        delivery = srcDelivery;
        unmatched = srcUnmatched;
        // Условия берём того же КП, что и доставку: смешивать срок из одного
        // счёта с ценой из другого нельзя.
        terms = src.terms;
        if (src.date) lastQuoteAt = src.date;
      }
    }
    // Доставка: числом из строки счёта, а если её там нет — из условий КП
    // (менеджер назвал сумму в письме). Приоритет у строки счёта: она
    // подтверждена документом.
    // Условия конкретного КП важнее: они описывают именно это предложение.
    // Условия карточки (шаг 6b) — то, что поставщик сказал в переписке без
    // счёта; показываем их, когда у КП своих нет, чтобы «срок 5 дней» из
    // письма не пропадал только потому, что счёт пришёл раньше письма.
    const effectiveTerms = terms ?? offer.terms ?? null;
    const deliveryTotal =
      delivery ?? (typeof effectiveTerms?.deliveryCost === 'number' ? effectiveTerms.deliveryCost : null);
    return {
      offer,
      cells,
      delivery: deliveryTotal,
      unmatched,
      quotesCount: quotes.length,
      lastQuoteAt,
      terms: effectiveTerms,
    };
  });
}

export function formatMoney(amount: number, currency: Currency): string {
  const formatted = Math.round(amount).toLocaleString('ru-RU');
  const symbol = currencySymbols[currency];
  return currency === 'USD' ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

export function formatUnit(amount: number, currency: Currency): string {
  const formatted = (Math.round(amount * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const symbol = currencySymbols[currency];
  return currency === 'USD' ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

export interface MoneyPart {
  amount: number;
  currency: Currency;
}

// Сумма набора «сумма в валюте» → одна строка: если валюта одна — в ней,
// иначе в долларах по курсу дня (два поставщика из разных стран в одном
// отборе — редкость, но не ошибка).
export function sumMoney(parts: MoneyPart[], rate: ExchangeRate | undefined): string {
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

// Отношение цены ячейки к цене отобранной в той же строке: «+36 %» / «−2 %».
// Это не «минимум» (его владелец запретил) — сравнение с тем, что человек
// уже выбрал сам. null — валюты разные и курса нет.
export function deltaToPicked(cell: Cell, picked: Cell): number | null {
  if (cell.currency === picked.currency) return cell.unitPrice / picked.unitPrice - 1;
  if (cell.usdUnit != null && picked.usdUnit != null && picked.usdUnit > 0) return cell.usdUnit / picked.usdUnit - 1;
  return null;
}

export function formatDelta(delta: number): string {
  const pct = Math.round(delta * 100);
  if (pct === 0) return 'та же цена';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export const STALE_QUOTE_DAYS = 14;

export function quoteAgeDays(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// Отобранное по позициям — единая выборка для экрана, PDF и письма.
export interface PickedLine {
  position: EstimateMaterial;
  cell: Cell | null;
}

export function pickLines(positions: EstimateMaterial[], proposal: SupplierProposal, columnById: Map<string, Column>): PickedLine[] {
  // Отбор, сделанный по строке, которой уже нет (счёт удалили/
  // пересопоставили), не считается — но и не стирается сам по себе, человек
  // увидит пустую позицию и выберет заново.
  return positions.map((p) => {
    const pick = proposal[p.id];
    const cell = pick ? columnById.get(pick.offerId)?.cells.get(p.id) : undefined;
    return { position: p, cell: cell && cell.itemId === pick?.itemId ? cell : (cell ?? null) };
  });
}

export function buildSnapshot(
  picked: PickedLine[],
  columnById: Map<string, Column>,
  total: string,
  delivery: string | null,
): SupplierProposalSnapshot {
  return {
    createdAt: new Date().toISOString(),
    total,
    delivery,
    lines: picked
      .filter((x): x is { position: EstimateMaterial; cell: Cell } => !!x.cell)
      .map(({ position, cell }) => ({
        positionId: position.id,
        positionName: position.name,
        supplierName: columnById.get(cell.offerId)?.offer.name ?? '',
        kind: cell.kind,
        unitPrice: cell.unitPrice,
        quantity: position.quantity,
        unit: position.unit,
        amount: cell.unitPrice * (position.quantity ?? 0),
        currency: cell.currency,
      })),
  };
}

// Раздел сметы, который «похоже, подходит» категории без привязки
// (владелец, 2026-09-15: у «Плинтусы, панели и лепнина» раздел «Плинтус» в
// смете был, а к категории не привязан — страница показывала «раздел не
// выбран» при пяти КП на руках). Совпадение по началу слова: «плинтус» ↔
// «плинтусы», «краск» ↔ «краски». Возвращает все разделы с материалами,
// подходящие — первыми.
export interface SectionCandidate {
  estimate: Estimate;
  section: EstimateSection;
  suggested: boolean;
}

function stems(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.slice(0, 5));
}

export function sectionCandidates(request: SupplierRequest, estimates: Estimate[]): SectionCandidate[] {
  const wanted = new Set(stems(request.title));
  const out: SectionCandidate[] = [];
  const scope = request.estimateId ? estimates.filter((e) => e.id === request.estimateId) : estimates;
  for (const estimate of scope) {
    for (const section of estimate.sections) {
      if (section.materials.length === 0) continue;
      const suggested = stems(section.title).some((s) => wanted.has(s));
      out.push({ estimate, section, suggested });
    }
  }
  return out.sort((a, b) => Number(b.suggested) - Number(a.suggested));
}
