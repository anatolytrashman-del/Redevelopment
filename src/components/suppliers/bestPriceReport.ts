import { convertToUsd } from '../../lib/currencyConvert';
import type { Currency } from '../../data/transactions';
import type { ExchangeRate } from '../../data/exchangeRates';
import type { EstimateMaterial } from '../../data/estimates';
import type { SupplierQuote } from '../../data/supplierQuotes';
import type { SupplierOffer, SupplierRequest } from '../../data/supplierResearch';
import { looksLikeDeliveryItem, type PurchaseItem, type PurchaseItemMatchKind } from '../../data/purchases';
import { cellVat, formatMoney, formatUnit, isDeliveryItem, unitPriceOf, type CellVat } from './priceComparisonModel';
import { esc, hrefOf, hostOf } from './priceComparisonPrint';

// Выгрузка «позиция → лучшая цена на ОРИГИНАЛ и на АНАЛОГ» (владелец,
// 2026-09-16: «сделай так, чтобы и в платформе была возможность выгрузить
// именно такую ведомость или в целом по всему, или по нужной поставке… вот
// такой формат намного лучше» — про документ, собранный руками в той же
// сессии и ушедший ему файлом).
//
// Чем отличается от уже существующего PDF (priceComparisonPrint.ts): тот
// показывает ОТБОР на утверждение руководителю стройки (что человек выбрал
// кнопками «Выбрать») и все предложения россыпью. Здесь — рабочий документ
// закупщика: одна строка на позицию, две колонки цен рядом, чтобы
// разговаривать с поставщиком: «вот оригинал по такой цене, вот аналог по
// такой, что дадите вы». Отбор человека не участвует: нужен снимок рынка,
// а не согласованное решение.
//
// ДВА ВИДА ЦЕНЫ в одной таблице — из-за того, как поставщики выставляют
// счета. Керамогранит и плинтус считаются в тех же единицах, что ведомость
// (м², пог. м) — там есть цена за единицу ведомости, и сумму на объём
// посчитать можно. Краска идёт банками и вёдрами, а ведомость даёт площадь
// в два слоя: цена за единицу ведомости не выводится, пока никто не задал
// расход. Раньше такие строки просто не попадали в сравнение
// (buildColumns отправляет их в unmatched) — и документ по краскам выходил
// пустым при пяти счетах на руках. Здесь они показываются ценой за тару
// поставщика с явной пометкой, а сумма по объёму не считается.
export type PriceBasis = 'ledger-unit' | 'quote-line';

// Строки-услуги, попавшие в счёт рядом с товаром: колеровка, доставка,
// подъём, погрузка. Распознавание счёта иногда привязывает их к той же
// позиции, что и сам товар (у «КраскиТорг» колеровка под цвет G485
// привязана к позиции краски G485) — и в документе «лучшей ценой» на
// краску становились 30 ₽ за литр колера. Цена услуги — не цена позиции,
// поэтому такие строки в выбор лучшей не идут; в счёте они остаются как
// были, никто их не прячет.
const SERVICE_LINE = /колеровк|подбор цвета|доставк|транспортн|погрузк|разгрузк|подъ[её]м|услуг|упаковк/i;

export function looksLikeServiceItem(item: PurchaseItem): boolean {
  return SERVICE_LINE.test(item.name ?? '');
}

// Та же услуга, но названная одним кодом цвета: у «Краски Здесь» колеровка
// идёт строкой «TVT G485» за 120 ₽ рядом со строкой краски за 10 160 ₽, и
// слова «колеровка» в ней нет. Ловим по форме счёта, а не по названию:
// строка на порядок дешевле медианы этого же счёта И её количество в точности
// повторяет количество другой, дорогой строки (42 банки краски — 42
// колеровки). Одного признака мало: дешёвая строка бывает и настоящей
// позицией (плинтус рядом с керамогранитом), а совпадение количеств — у двух
// цветов одной краски.
function serviceLineIds(items: PurchaseItem[]): Set<string> {
  const priced = items.filter((i) => i.price != null && i.price > 0);
  if (priced.length < 3) return new Set();
  const sorted = [...priced].map((i) => i.price as number).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const out = new Set<string>();
  for (const item of priced) {
    const price = item.price as number;
    if (price >= median * 0.1) continue;
    const twin = priced.some((other) => other !== item && other.quantity === item.quantity && (other.price as number) > price * 5);
    if (twin) out.add(item.id);
  }
  return out;
}

export interface PriceOption {
  offerId: string;
  supplierName: string;
  quoteId: string | null;
  quoteTitle: string;
  quoteDate: string | null;
  // Цена и то, за что она: за единицу ведомости либо за тару счёта.
  amount: number;
  currency: Currency;
  basis: PriceBasis;
  // Как в счёте: сколько и в чём (14 вёдер по 15 кг).
  quotedQuantity: number | null;
  quotedUnit: string;
  itemName: string;
  kind: PurchaseItemMatchKind;
  note: string;
  productUrl: string;
  vat: CellVat;
  vatRate: number | null;
  usd: number | null;
  // Сумма на объём ведомости — только для цены за единицу ведомости.
  total: number | null;
}

export interface ReportPosition {
  id: string;
  name: string;
  unit: string;
  quantity: number | null;
  note: string;
}

export interface BestPriceRow {
  position: ReportPosition;
  // Лучшая цена ровно по ведомости и лучшая цена на замену. Аналогом
  // считается 'alternative'; когда замен нет, но есть строки «уточнить»
  // ('check' — человек при сопоставлении усомнился), берётся лучшая из них
  // и помечается в документе: молчать о единственной цене на позицию
  // вреднее, чем показать её с оговоркой.
  original: PriceOption | null;
  alternative: PriceOption | null;
  alternativeIsCheck: boolean;
  others: PriceOption[];
  // Сравнивали цены за тару поставщика (см. шапку) — сумму не считаем и
  // предупреждаем, что тары у поставщиков разные.
  packagingOnly: boolean;
}

export interface BestPriceSection {
  requestId: string;
  title: string;
  sectionTitle: string;
  rows: BestPriceRow[];
  // Категория сравнивается лотом целиком (Грильято): позиций ведомости у
  // такой поставки нет, есть комплекты поставщиков.
  lot: boolean;
}

export interface BestPriceReport {
  sections: BestPriceSection[];
  scopeTitle: string;
  preparedBy: string;
  rate: ExchangeRate | undefined;
}

// Последний счёт поставщика, где вообще были цены, вытесняет прежние: та же
// логика, что в buildColumns (обновлённый счёт важнее старого, а наша
// ведомость, распознанная как счёт без цен, ничего не вытесняет).
function lastPricedQuote(quotes: SupplierQuote[]): SupplierQuote | null {
  const sorted = [...quotes].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  let found: SupplierQuote | null = null;
  for (const q of sorted) {
    if ((q.items ?? []).some((i) => i.price != null && i.price > 0)) found = q;
  }
  return found;
}

function optionOf(
  offer: SupplierOffer,
  quote: SupplierQuote | null,
  item: PurchaseItem,
  position: ReportPosition,
  rate: ExchangeRate | undefined,
): PriceOption | null {
  const currency = quote?.currency ?? offer.currency;
  const ledgerUnit = unitPriceOf(item, position);
  const amount = ledgerUnit ?? (item.price != null && item.price > 0 ? item.price : null);
  if (amount == null) return null;
  const basis: PriceBasis = ledgerUnit != null ? 'ledger-unit' : 'quote-line';
  const v = cellVat(item, quote?.terms ?? null);
  return {
    offerId: offer.id,
    supplierName: offer.name,
    quoteId: quote?.id ?? null,
    quoteTitle: quote?.title ?? 'Позиции карточки',
    quoteDate: quote?.createdAt ?? null,
    amount,
    currency,
    basis,
    quotedQuantity: item.quantity,
    quotedUnit: item.unit ?? '',
    itemName: item.name,
    kind: item.matchKind && item.matchKind !== 'delivery' ? item.matchKind : 'exact',
    note: item.matchNote ?? '',
    productUrl: item.productUrl ?? '',
    vat: v.vat,
    vatRate: v.rate,
    usd: convertToUsd(amount, currency, rate),
    total: basis === 'ledger-unit' && position.quantity != null ? amount * position.quantity : null,
  };
}

const cheaper = (a: PriceOption, b: PriceOption) => (a.usd ?? a.amount) - (b.usd ?? b.amount);

function pickBest(options: PriceOption[], kinds: PurchaseItemMatchKind[]): PriceOption | null {
  const scope = options.filter((o) => kinds.includes(o.kind));
  if (scope.length === 0) return null;
  return [...scope].sort(cheaper)[0];
}

// Позиции документа — материалы раздела сметы ПЛЮС «осиротевшие» привязки:
// строки счетов, привязанные к id, которого в разделе сметы нет. Так вышло
// не по ошибке — распознавание счёта привязывает строку к тому списку,
// который реально уходил поставщику, а у красок и потолков это был список
// позиций запроса (поле items у запроса удалено из приложения 2026-09-11,
// в базе колонка осталась, и старые привязки на неё ссылаются). Без этого
// документ по краскам выходил бы пустым при пяти счетах на руках, поэтому
// такие группы показываем отдельной строкой: название берём из счёта, где
// поставщик дал ровно запрошенное, и честно помечаем происхождение.
const ORPHAN_NOTE = 'позиция из запроса поставщику: в разделе сметы такой строки нет, объём в ведомости не задан';

export function reportPositions(positions: EstimateMaterial[], offers: SupplierOffer[], quotesByOffer: Map<string, SupplierQuote[]>): ReportPosition[] {
  const out: ReportPosition[] = positions.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    quantity: p.quantity,
    note: p.note ?? '',
  }));
  const known = new Set(out.map((p) => p.id));
  const orphans = new Map<string, { exact: string | null; any: string }>();
  for (const offer of offers) {
    const quotes = quotesByOffer.get(offer.id) ?? [];
    const quote = lastPricedQuote(quotes);
    const items = quote ? quote.items ?? [] : offer.items ?? [];
    const services = serviceLineIds(items);
    for (const item of items) {
      const id = item.sourceMaterialId;
      if (!id || known.has(id)) continue;
      if (item.matchKind === 'none') continue;
      if (isDeliveryItem(item) || looksLikeDeliveryItem(item.name) || looksLikeServiceItem(item) || services.has(item.id)) continue;
      if (!(item.price != null && item.price > 0)) continue;
      const seen = orphans.get(id) ?? { exact: null, any: item.name };
      if (item.matchKind === 'exact' && !seen.exact) seen.exact = item.name;
      orphans.set(id, seen);
    }
  }
  for (const [id, names] of orphans) {
    out.push({ id, name: names.exact ?? names.any, unit: '', quantity: null, note: ORPHAN_NOTE });
  }
  return out;
}

export function buildBestPriceRows(
  positions: ReportPosition[],
  offers: SupplierOffer[],
  quotesByOffer: Map<string, SupplierQuote[]>,
  rate: ExchangeRate | undefined,
): BestPriceRow[] {
  const byPosition = new Map<string, PriceOption[]>();
  for (const offer of offers) {
    const quotes = quotesByOffer.get(offer.id) ?? [];
    const quote = lastPricedQuote(quotes);
    const items = quote ? quote.items ?? [] : offer.items ?? [];
    const services = serviceLineIds(items);
    for (const item of items) {
      // Явное решение человека «это не позиция ведомости» сильнее любой из
      // эвристик ниже: их придумывали как раз затем, чтобы угадывать то, что
      // теперь просто записано в строке.
      if (item.matchKind === 'none') continue;
      if (isDeliveryItem(item) || looksLikeDeliveryItem(item.name) || looksLikeServiceItem(item) || services.has(item.id)) continue;
      if (!item.sourceMaterialId) continue;
      const position = positions.find((p) => p.id === item.sourceMaterialId);
      if (!position) continue;
      const option = optionOf(offer, quote, item, position, rate);
      if (!option) continue;
      byPosition.set(position.id, [...(byPosition.get(position.id) ?? []), option]);
    }
  }

  return positions.map((position) => {
    const all = byPosition.get(position.id) ?? [];
    // Цены за единицу ведомости и цены за тару в одной куче несравнимы:
    // 1 864 ₽/м² и 5 135 ₽/банка — разные вещи. Когда есть хоть одна цена
    // за единицу ведомости, выбираем лучших только среди них.
    const ledger = all.filter((o) => o.basis === 'ledger-unit');
    const scope = ledger.length > 0 ? ledger : all;
    const original = pickBest(scope, ['exact']);
    const alternative = pickBest(scope, ['alternative']);
    const fallback = alternative ? null : pickBest(scope, ['check']);
    const best = [original, alternative ?? fallback].filter((o): o is PriceOption => !!o);
    const others = [...all].filter((o) => !best.includes(o)).sort(cheaper);
    return {
      position,
      original,
      alternative: alternative ?? fallback,
      alternativeIsCheck: !alternative && !!fallback,
      others,
      packagingOnly: scope.length > 0 && ledger.length === 0,
    };
  });
}

// Итог комплекта для категории-лота: цена КП = сумма строк счёта, доставка
// считается отдельно (у поставщика она строкой в том же счёте). Своего
// поля с итогом у таких предложений нет — supplier_research_offers.price по
// лотовым категориям стоит нулём.
export function lotTotal(quote: SupplierQuote): { items: number; delivery: number } {
  let items = 0;
  let delivery = 0;
  for (const item of quote.items ?? []) {
    const sum = (item.quantity ?? 0) * (item.price ?? 0);
    if (sum <= 0) continue;
    if (isDeliveryItem(item) || looksLikeDeliveryItem(item.name)) delivery += sum;
    else items += sum;
  }
  return { items, delivery };
}

// Лотовая категория: одна строка на всю поставку. Оригинал — самый дешёвый
// комплект ровно по заявке, аналог — самый дешёвый среди помеченных
// альтернативой (Грильято h30 вместо h40).
export function buildLotRows(
  request: SupplierRequest,
  positions: EstimateMaterial[],
  offers: SupplierOffer[],
  quotesByOffer: Map<string, SupplierQuote[]>,
  rate: ExchangeRate | undefined,
): BestPriceRow[] {
  const volume = positions.find((p) => p.quantity != null);
  const position: ReportPosition = {
    id: request.id,
    name: `${request.title} — поставка целиком`,
    unit: volume?.unit ?? 'комплект',
    quantity: volume?.quantity ?? null,
    note: positions.map((p) => p.name).join(' · '),
  };
  const options: PriceOption[] = [];
  for (const offer of offers) {
    // Поставщик присылает варианты комплекта пачкой в один день (Ирбис —
    // оцинковка и алюминий двумя счетами), а на следующей неделе — новый
    // прайс. Берём все счета последнего дня: иначе либо один вариант
    // потеряется, либо со свежей ценой будет конкурировать позапрошлая.
    const priced = (quotesByOffer.get(offer.id) ?? []).filter((q) => lotTotal(q).items > 0);
    const lastDay = priced.reduce((max, q) => (q.createdAt.slice(0, 10) > max ? q.createdAt.slice(0, 10) : max), '');
    for (const quote of priced.filter((q) => q.createdAt.slice(0, 10) === lastDay)) {
      const { items, delivery } = lotTotal(quote);
      const perUnit = position.quantity ? items / position.quantity : null;
      options.push({
        offerId: offer.id,
        supplierName: offer.name,
        quoteId: quote.id,
        quoteTitle: quote.title,
        quoteDate: quote.createdAt,
        amount: perUnit ?? items,
        currency: quote.currency,
        basis: perUnit != null ? 'ledger-unit' : 'quote-line',
        quotedQuantity: position.quantity,
        quotedUnit: position.unit,
        itemName: `${quote.items?.length ?? 0} строк, комплект ${formatMoney(items, quote.currency)}${delivery > 0 ? ` + доставка ${formatMoney(delivery, quote.currency)}` : ''}`,
        kind: quote.isAlternative ? 'alternative' : 'exact',
        note: quote.alternativeNote ?? '',
        productUrl: offer.websiteUrl ?? '',
        vat: 'unknown',
        vatRate: null,
        usd: convertToUsd(perUnit ?? items, quote.currency, rate),
        total: items,
      });
    }
  }
  const original = pickBest(options, ['exact']);
  const alternative = pickBest(options, ['alternative']);
  const best = [original, alternative].filter((o): o is PriceOption => !!o);
  return [
    {
      position,
      original,
      alternative,
      alternativeIsCheck: false,
      others: [...options].filter((o) => !best.includes(o)).sort(cheaper),
      packagingOnly: false,
    },
  ];
}

const KIND_LABEL: Record<PurchaseItemMatchKind, string> = {
  exact: 'ровно по ведомости',
  alternative: 'аналог',
  check: 'требует уточнения',
  delivery: 'доставка',
  none: 'не позиция ведомости',
};

function vatHint(option: PriceOption): string {
  if (option.vat === 'net') return 'цена без НДС';
  if (option.vat === 'converted') return `пересчитано с НДС${option.vatRate ? ` ${option.vatRate}%` : ''}`;
  return '';
}

function priceUnitLabel(option: PriceOption, position: ReportPosition): string {
  if (option.basis === 'ledger-unit') return `за ${position.unit || 'ед.'}`;
  const pack = [option.quotedQuantity != null ? `${option.quotedQuantity.toLocaleString('ru-RU')}` : '', option.quotedUnit].filter(Boolean).join(' ');
  return pack ? `за ${option.quotedUnit || 'ед.'} счёта (в счёте ${pack})` : 'за единицу счёта';
}

const linkHtml = (url: string) => (url ? `<a class="lnk" href="${esc(hrefOf(url))}">${esc(hostOf(url))}</a>` : '');

function optionCell(option: PriceOption | null, position: ReportPosition, empty: string, cls: 'orig' | 'alt'): string {
  if (!option) {
    return `<td class="${cls} num"><span class="muted">—</span></td><td class="${cls}" colspan="2"><span class="muted">${esc(empty)}</span></td>`;
  }
  const hint = vatHint(option);
  const date = option.quoteDate ? new Date(option.quoteDate).toLocaleDateString('ru-RU') : '';
  return (
    `<td class="${cls} num"><b>${esc(formatUnit(option.amount, option.currency))}</b><span class="muted">${esc(priceUnitLabel(option, position))}</span>${hint ? `<span class="muted warn">${esc(hint)}</span>` : ''}</td>` +
    `<td class="${cls}"><b>${esc(option.supplierName)}</b><span class="muted">${esc(option.itemName)}</span>${option.productUrl ? `<span class="muted">${linkHtml(option.productUrl)}</span>` : ''}</td>` +
    `<td class="${cls}"><span class="tag ${option.kind}">${esc(KIND_LABEL[option.kind])}</span>${option.note ? `<span class="muted">${esc(option.note)}</span>` : ''}` +
    `${date ? `<span class="muted">счёт от ${esc(date)}</span>` : ''}</td>`
  );
}

function othersCell(row: BestPriceRow): string {
  if (row.others.length === 0) return '<span class="muted">других предложений нет</span>';
  return row.others
    .slice(0, 8)
    .map(
      (o) =>
        `<div class="other"><b>${esc(o.supplierName)}</b> — ${esc(formatUnit(o.amount, o.currency))} ${esc(priceUnitLabel(o, row.position))} ` +
        `<span class="tag ${o.kind}">${esc(KIND_LABEL[o.kind])}</span>${o.note ? ` <span class="muted-inline">${esc(o.note)}</span>` : ''}</div>`,
    )
    .join('');
}

function sectionHtml(section: BestPriceSection): string {
  const rows = section.rows
    .map((row, i) => {
      const { position } = row;
      const qty = position.quantity != null ? `${position.quantity.toLocaleString('ru-RU')} ${esc(position.unit)}` : esc(position.unit);
      const total =
        row.original?.total != null
          ? esc(formatMoney(row.original.total, row.original.currency))
          : row.packagingOnly
            ? '<span class="muted">цена за тару</span>'
            : '<span class="muted">—</span>';
      return (
        `<tr><td class="c">${i + 1}</td>` +
        `<td><b>${esc(position.name)}</b><span class="muted">${qty}</span>${position.note ? `<span class="muted">${esc(position.note)}</span>` : ''}</td>` +
        optionCell(row.original, position, 'оригинала не предложил никто', 'orig') +
        optionCell(row.alternative, position, 'замен не предлагали', 'alt') +
        `<td class="others">${othersCell(row)}` +
        `${row.alternativeIsCheck ? '<div class="muted">замен никто не дал — в колонке аналога строка, которую при сопоставлении пометили «уточнить».</div>' : ''}` +
        `${row.packagingOnly ? '<div class="muted warn">цены за тару поставщика (банки, вёдра) — к единице ведомости не приведены, сравнивать вручную</div>' : ''}</td>` +
        `<td class="num strong">${total}</td></tr>`
      );
    })
    .join('');
  const summable = section.rows.filter((r) => r.original?.total != null);
  const currencies = new Set(summable.map((r) => r.original!.currency));
  const totalLine =
    summable.length > 0 && currencies.size === 1
      ? `<tfoot><tr><td colspan="9">Итого по лучшим оригиналам, где цена идёт за единицу ведомости (${summable.length} из ${section.rows.length} позиций)</td>` +
        `<td class="num total">${esc(formatMoney(summable.reduce((a, r) => a + r.original!.total!, 0), [...currencies][0]))}</td></tr></tfoot>`
      : '';
  return `<section class="block">
    <h2>${esc(section.title)}${section.sectionTitle ? ` <span class="qty">раздел сметы «${esc(section.sectionTitle)}»</span>` : ''}</h2>
    ${section.lot ? '<p class="note">Поставка сравнивается комплектом целиком: у категории есть комплектующие, и заказывать их у разных поставщиков смысла нет.</p>' : ''}
    <table class="grid">
      <colgroup><col class="c"><col class="pos"><col class="price"><col class="who"><col class="mark"><col class="price"><col class="who"><col class="mark"><col class="others"><col class="sum"></colgroup>
      <thead>
        <tr><th rowspan="2" class="c">№</th><th rowspan="2">Позиция ведомости</th>
        <th colspan="3" class="orig">Лучшая цена — оригинал</th>
        <th colspan="3" class="alt">Лучшая цена — аналог</th>
        <th rowspan="2">Другие предложения</th><th rowspan="2" class="num">Сумма на объём</th></tr>
        <tr><th class="orig num">Цена</th><th class="orig">Поставщик и что именно</th><th class="orig">Пометка</th>
        <th class="alt num">Цена</th><th class="alt">Поставщик и что именно</th><th class="alt">Пометка</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      ${totalLine}
    </table>
  </section>`;
}

export function buildBestPriceHtml(report: BestPriceReport): string {
  const hasPackaging = report.sections.some((s) => s.rows.some((r) => r.packagingOnly));
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>${esc(report.scopeTitle)} — лучшие цены</title>
<style>
  @page { size: A3 landscape; margin: 10mm; }
  @font-face { font-family: 'Montserrat'; src: url('/fonts/Montserrat-Regular.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  @font-face { font-family: 'Montserrat'; src: url('/fonts/Montserrat-SemiBold.woff2') format('woff2'); font-weight: 600 700; font-display: swap; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #fff; color: #14151a; font-family: 'Montserrat', system-ui, sans-serif; font-size: 8.5pt; line-height: 1.3; }
  h1 { font-size: 16pt; margin: 0; letter-spacing: -.01em; }
  h2 { font-size: 11.5pt; margin: 0 0 6px; break-after: avoid; }
  h2 .qty { font-weight: 400; font-size: 9pt; color: #6b6d76; }
  header { border-bottom: 2px solid #14151a; padding-bottom: 8px; margin-bottom: 12px; }
  .brand { font-size: 8pt; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: #9a9ba3; }
  .sub { color: #6b6d76; margin-top: 3px; max-width: 250mm; }
  .block { margin-bottom: 14px; break-inside: auto; }
  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.grid th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; color: #fff; background: #14151a; font-weight: 600; padding: 4px 6px; }
  table.grid th.orig { background: #2f6b3f; }
  table.grid th.alt { background: #8a6410; }
  table.grid td { border-bottom: 1px solid #e7e5e2; padding: 5px 6px; vertical-align: top; word-wrap: break-word; }
  table.grid td.orig { background: #f0f7f1; }
  table.grid td.alt { background: #fdf6e7; }
  table.grid td.num, table.grid th.num { text-align: right; white-space: nowrap; }
  table.grid td.c { text-align: center; color: #9a9ba3; }
  table.grid td.strong { font-weight: 600; }
  table.grid tr { break-inside: avoid; }
  table.grid tfoot td { border-top: 1.5px solid #14151a; border-bottom: 0; font-weight: 600; padding-top: 6px; text-align: right; }
  td.total { font-size: 11pt; color: #157f42; }
  col.c { width: 2.5%; } col.pos { width: 13%; } col.price { width: 7.5%; } col.who { width: 11%; } col.mark { width: 9%; }
  col.others { width: 15%; } col.sum { width: 6.5%; }
  .muted { display: block; color: #6b6d76; font-size: 7.5pt; margin-top: 2px; }
  .muted.warn { color: #906721; font-weight: 600; }
  .muted-inline { color: #6b6d76; }
  .other { margin-bottom: 3px; font-size: 7.5pt; }
  .tag { display: inline-block; border-radius: 20px; padding: 0 6px; font-size: 7.5pt; font-weight: 600; }
  .tag.exact { background: #e6f6ed; color: #157f42; }
  .tag.alternative { background: #fbf1de; color: #906721; }
  .tag.check { background: #fce9eb; color: #d21e34; }
  .tag.delivery { background: #f5f4f2; color: #6b6d76; }
  .lnk { color: #14151a; text-decoration: none; border-bottom: 1px dotted #9a9ba3; }
  .note { color: #6b6d76; margin: 4px 0 6px; font-size: 8pt; }
</style></head><body>
<header>
  <div class="brand">Redevelopment · Закупки · Лучшие цены</div>
  <h1>${esc(report.scopeTitle)}</h1>
  <div class="sub">Цены — как в счетах и КП поставщиков, последний счёт каждого. <b>Оригинал</b> — ровно та позиция, что в ведомости;
  <b>аналог</b> — замена другого бренда или артикула, отличие в пометке.${hasPackaging ? ' Там, где поставщики выставляют тару (банки, вёдра), а ведомость даёт площадь, цена приведена за тару счёта и сумма на объём не считается.' : ''}
  Сформировано ${new Date().toLocaleDateString('ru-RU')}${report.preparedBy ? `, подготовил: ${esc(report.preparedBy)}` : ''}.</div>
</header>
${report.sections.map(sectionHtml).join('')}
</body></html>`;
}
