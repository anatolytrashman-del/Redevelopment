import type { EstimateMaterial } from '../../data/estimates';
import type { ExchangeRate } from '../../data/exchangeRates';
import { PURCHASE_ITEM_MATCH_KIND_LABELS, type PurchaseItemMatchKind } from '../../data/purchases';
import type { SupplierRequest } from '../../data/supplierResearch';
import {
  formatMoney,
  formatUnit,
  sumMoney,
  type Cell,
  type Column,
  type MoneyPart,
  type PickedLine,
} from './priceComparisonModel';

// Печатный документ и письмо руководителю стройки — по одной и той же
// выборке, что и экран (см. PriceComparisonCard.tsx, ComparisonDoc).
//
// Владелец, 2026-09-15: «когда пытаешься выгрузить в pdf, обрезается. Надо,
// чтобы всё было видно». Печать — не копия экрана, а СВОЙ документ:
// экранная таблица живёт в горизонтальном скролле (столбцов столько,
// сколько поставщиков), на бумаге скролла нет. Матрица «позиции ×
// поставщики» разворачивается в блоки по позициям, поставщики — строками,
// ширина не зависит от их числа. Письмо — та же логика, но вёрстка
// таблицами с inline-стилями (почтовые клиенты режут <style>).

export interface ComparisonFunnel {
  sent: number;
  letters: number;
  replied: number;
  repliedNoQuote: number;
  confirmed: number;
  quotesCount: number;
  pricedPositions: number;
}

export interface ComparisonDoc {
  request: SupplierRequest;
  estimateTitle?: string | null;
  positions: EstimateMaterial[];
  country: string;
  columns: Column[];
  columnById: Map<string, Column>;
  picked: PickedLine[];
  pickedCells: { position: EstimateMaterial; cell: Cell }[];
  pickedOfferIds: Set<string>;
  pickedParts: MoneyPart[];
  pickedDelivery: MoneyPart[];
  kinds: Partial<Record<PurchaseItemMatchKind, number>>;
  funnel: ComparisonFunnel;
  rate: ExchangeRate | undefined;
  preparedBy: string;
  total: string;
}

export const esc = (v: string) =>
  v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export function hrefOf(url: string): string {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(hrefOf(url)).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const linkHtml = (url: string, style = '') => {
  if (!url) return '';
  return `<a class="lnk" style="${style}" href="${esc(hrefOf(url))}">${esc(hostOf(url))}</a>`;
};

// В примечаниях сметы часто лежит ссылка на образец целиком — на бумаге и
// в письме длинный URL съедает полстроки, печатаем домен ссылкой.
const withLinks = (text: string, style = '') =>
  esc(text).replace(/https?:\/\/\S+/g, (url) => linkHtml(url.replace(/[).,;]+$/, ''), style));

const qty = (p: EstimateMaterial) => `${p.quantity != null ? p.quantity.toLocaleString('ru-RU') : '—'} ${esc(p.unit)}`;

function kindLabel(kind: PurchaseItemMatchKind): string {
  return PURCHASE_ITEM_MATCH_KIND_LABELS[kind];
}

// Цена за единицу ведомости с явной единицей и, где известен расход, за
// единицу товара поставщика. Владелец, 2026-09-17: «цена за единицу —
// непонятно, что там за единица; пиши за литр, раз это краска». Расход
// (EstimateMaterial.consumption, «сколько литров на 1 м² с учётом слоёв»)
// задан у красок, поэтому цена за литр считается из него, а не выдумывается:
// нет расхода — нет и второй строки.
function priceCell(cell: Cell, position: EstimateMaterial): string {
  const perLedgerUnit = `${esc(formatUnit(cell.unitPrice, cell.currency))} / ${esc(position.unit || 'ед.')}`;
  const consumption = position.consumption ?? null;
  const goodsUnit = position.consumptionUnit ?? '';
  if (!consumption || consumption <= 0 || !goodsUnit) return perLedgerUnit;
  const perGoodsUnit = formatUnit(cell.unitPrice / consumption, cell.currency);
  return `${perLedgerUnit}<span class="muted">${esc(perGoodsUnit)} за ${esc(goodsUnit)}</span>`;
}

// То же для письма: почтовые клиенты режут <style>, поэтому инлайн.
function emailGoodsUnitPrice(cell: Cell, position: EstimateMaterial, muted: string): string {
  const consumption = position.consumption ?? null;
  const goodsUnit = position.consumptionUnit ?? '';
  if (!consumption || consumption <= 0 || !goodsUnit) return '';
  return `<span style="${muted}">${esc(formatUnit(cell.unitPrice / consumption, cell.currency))} за ${esc(goodsUnit)}</span>`;
}

function deliveryNames(doc: ComparisonDoc): string {
  return [...doc.pickedOfferIds]
    .filter((id) => doc.columnById.get(id)?.delivery != null)
    .map((id) => doc.columnById.get(id)!.offer.name)
    .join(', ');
}

const GREEN_OBJECT_ADDRESS = '1-й Геологический проезд, 1, посёлок Зелёный, Московская область';

function isGreenObjectEstimate(doc: ComparisonDoc): boolean {
  return doc.country === 'Россия'
    && /^(?:смета\s+)?зел[её]ный$/iu.test(doc.estimateTitle?.trim() ?? '');
}

// Редакционные данные конкретных отчётов из заданий владельца 17.09.2026.
// Не подставляем адрес и подтверждённое наличие в другие сметы и закупки.
function isPaintApproval(doc: ComparisonDoc): boolean {
  return doc.request.title === 'Краски, обои и декоративные покрытия'
    && doc.request.sectionTitle === 'Краски'
    && isGreenObjectEstimate(doc);
}

function isPlinthApproval(doc: ComparisonDoc): boolean {
  return doc.request.title === 'Плинтусы, панели и лепнина'
    && doc.request.sectionTitle === 'Плинтус'
    && isGreenObjectEstimate(doc);
}

export function approvalPrintTitle(doc: ComparisonDoc): string {
  if (isPaintApproval(doc)) return 'Поставка красок';
  if (isPlinthApproval(doc)) return 'Плинтус';
  return doc.request.title;
}

export function buildPrintHtml(doc: ComparisonDoc): string {
  const { columns, columnById, picked, pickedCells, pickedOfferIds, pickedDelivery, funnel, rate } = doc;
  const paintApproval = isPaintApproval(doc);
  const plinthApproval = isPlinthApproval(doc);
  const greenObjectApproval = paintApproval || plinthApproval;
  const title = approvalPrintTitle(doc);
  const kindTag = (kind: PurchaseItemMatchKind) => `<span class="tag ${kind}">${esc(kindLabel(kind))}</span>`;
  const sortedPicked = [...picked].sort((a, b) => {
    const aSupplier = a.cell ? (columnById.get(a.cell.offerId)?.offer.name ?? '') : '\uffff';
    const bSupplier = b.cell ? (columnById.get(b.cell.offerId)?.offer.name ?? '') : '\uffff';
    return aSupplier.localeCompare(bSupplier, 'ru');
  });

  const proposalRows = sortedPicked
    .map(({ position, cell }) => {
      if (!cell) {
        return `<tr class="empty"><td>${esc(position.name)}<span class="muted">${qty(position)}</span></td><td colspan="4">не отобрано</td></tr>`;
      }
      const offer = columnById.get(cell.offerId)?.offer;
      return (
        `<tr class="picked"><td>${esc(position.name)}<span class="muted">${qty(position)}</span></td>` +
        `<td>${esc(offer?.name ?? '')}</td>` +
        `<td>${paintApproval && cell.kind === 'exact' && /кристально\s+белая/iu.test(position.name) ? '<span class="tag exact">подходит под ТЗ</span>' : kindTag(cell.kind)}${cell.note ? `<span class="muted">${withLinks(cell.note)}</span>` : ''}${cell.productUrl ? `<span class="muted">${linkHtml(cell.productUrl)}</span>` : ''}</td>` +
        `<td class="num">${priceCell(cell, position)}</td>` +
        `<td class="num strong">${esc(formatMoney(cell.unitPrice * (position.quantity ?? 0), cell.currency))}</td></tr>`
      );
    })
    .join('');
  const deliveryRow =
    pickedDelivery.length > 0
      ? `<tr><td colspan="4">Доставка: ${esc(deliveryNames(doc))}</td><td class="num strong">${esc(sumMoney(pickedDelivery, rate))}</td></tr>`
      : '';
  const proposalBlock =
    pickedCells.length === 0
      ? `<p class="note">Позиции ещё не отобраны. Откройте «Сравнение цен» и отметьте кнопкой «Выбрать», что выносится на утверждение — состав и сумма появятся здесь.</p>`
      : `<table class="grid">
           <thead><tr><th>Позиция ведомости</th><th>Поставщик</th><th>Соответствие</th><th class="num">Цена</th><th class="num">Сумма</th></tr></thead>
           <tbody>${proposalRows}${deliveryRow}</tbody>
         </table>`;

  const termsRows = columns
    .filter((c) => pickedOfferIds.has(c.offer.id))
    .map(
      (c) =>
        `<tr><td>${esc(c.offer.name)}${c.lastQuoteAt ? `<span class="muted">счёт от ${new Date(c.lastQuoteAt).toLocaleDateString('ru-RU')}</span>` : ''}</td>` +
        `<td class="num">${plinthApproval ? 'В цене' : c.delivery != null ? esc(formatMoney(c.delivery, c.deliveryCurrency)) : 'в счёте нет'}</td>` +
        `<td>${paintApproval ? 'Все в наличии. Доставка в течение нескольких дней по запросу' : plinthApproval ? 'В наличии, доставка по запросу' : c.offer.termsNote ? withLinks(c.offer.termsNote) : '—'}</td></tr>`,
    )
    .join('');

  const signatureField = (caption: string, value = '') =>
    `<div class="sign"><div class="line">${esc(value)}</div><div class="cap">${esc(caption)}</div></div>`;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>${esc(title)} — предложение на утверждение</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @font-face { font-family: Montserrat; src: url('/fonts/Montserrat-Regular.woff2') format('woff2'); font-weight: 400; }
  @font-face { font-family: Montserrat; src: url('/fonts/Montserrat-SemiBold.woff2') format('woff2'); font-weight: 600; }
  @font-face { font-family: Montserrat; src: url('/fonts/Montserrat-ExtraBold.woff2') format('woff2'); font-weight: 700 900; }
  /* Ненулевой letter-spacing включает посимвольный рендер html2canvas:
     пробелы в Montserrat сохраняются, включая разделители сумм и ₽. */
  body { margin: 0; background: #fff; color: #14151a; font-family: Montserrat, Arial, sans-serif; font-size: 9pt; line-height: 1.35; letter-spacing: .01px; }
  body { min-height: 1094px; display: flex; flex-direction: column; padding-bottom: 20px; }
  h1 { font-size: 17pt; margin: 0; }
  h2 { font-size: 12pt; margin: 0 0 10px; break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 0 0 4px; break-after: avoid; }
  h3 .qty { font-weight: 400; color: #6b6d76; }
  header { border-bottom: 2px solid #14151a; padding-bottom: 10px; margin-bottom: 18px; }
  .sub { color: #6b6d76; margin-top: 5px; }
  .block { break-inside: avoid; margin-bottom: 12px; }
  .funnel { display: flex; gap: 12px; margin-bottom: 22px; }
  .funnel div { flex: 0 1 calc(50% - 6px); display: flex; align-items: baseline; gap: 7px; border: 1px solid #e7e5e2; border-radius: 6px; padding: 10px 12px; }
  .funnel b { font-size: 14pt; line-height: 1.1; }
  .funnel span { color: #6b6d76; font-size: 8.5pt; }
  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.grid th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #6b6d76; font-weight: 600; border-bottom: 1px solid #d8d6d2; padding: 7px; }
  table.grid td { border-bottom: 1px solid #e7e5e2; padding: 8px 7px; vertical-align: top; word-wrap: break-word; }
  table.grid td.num, table.grid th.num { text-align: right; white-space: nowrap; width: 17%; }
  table.grid td.strong { font-weight: 600; }
  table.grid tfoot td { border-top: 1.5px solid #14151a; border-bottom: 0; font-weight: 600; padding-top: 6px; }
  td.total { font-size: 12pt; color: #157f42; }
  tr.picked td { background: #e6f6ed; }
  tr.empty td { color: #9a9ba3; }
  .muted { display: block; color: #6b6d76; font-size: 8pt; }
  .pick { display: block; color: #157f42; font-weight: 600; font-size: 8pt; }
  .tag { display: inline-block; border-radius: 20px; padding: 0 6px; font-size: 8pt; font-weight: 600; }
  .tag.exact { background: #e6f6ed; color: #157f42; }
  .tag.alternative { background: #fbf1de; color: #906721; }
  .tag.check { background: #fce9eb; color: #d21e34; }
  .tag.delivery { background: #f5f4f2; color: #6b6d76; }
  .lnk { color: #14151a; text-decoration: none; border-bottom: 1px dotted #9a9ba3; }
  .note { color: #6b6d76; margin: 6px 0 0; font-size: 8pt; }
  .note.warn { color: #906721; }
  .total-line { font-size: 20pt; font-weight: 700; color: #157f42; margin: 4px 0 14px; }
  .signs { display: flex; gap: 24px; break-inside: avoid; }
  .sign { flex: 1; }
  .sign .line { border-bottom: 1px solid #d8d6d2; min-height: 22px; padding-bottom: 2px; }
  /* У подписи отдельная высокая строка: Montserrat на малом кегле иначе
     обрезается html2canvas по нижней границе line box. */
  .sign .cap { height: 28px; padding: 5px 0 9px; font-size: 8pt; line-height: 14px; letter-spacing: .02em; color: #9a9ba3; }
  .prepared { margin-top: auto; margin-bottom: 12px; padding-top: 24px; break-inside: avoid; }
  /* Печать: документ не обязан помещаться на страницу, но рваться должен по
     живому (владелец, 2026-09-17: «выгрузка в pdf разрывает страницу на
     несколько, учти и адаптируй»). Строка таблицы, подписи и заголовок с
     первой строкой раздела не разрываются, шапка длинной таблицы
     повторяется на следующей странице. */
  table.grid tr { break-inside: avoid; }
  table.grid thead { display: table-header-group; }
  table.grid tfoot { display: table-row-group; }
  h2, h3 { break-after: avoid; }
  section { break-inside: auto; margin-bottom: 24px; }
  section.terms-section { margin-bottom: 0; }
  .terms th:first-child { width: 30%; }
</style></head><body>
<header>
  <h1>${esc(title)}</h1>
  ${greenObjectApproval ? `<div class="sub">Объект: ${GREEN_OBJECT_ADDRESS}</div>` : ''}
</header>

<div class="funnel">
  <div><span>Проработано поставщиков:</span><b>${funnel.sent}</b></div>
</div>

<section>
  <h2>Предложение на утверждение</h2>
  ${pickedCells.length > 0 ? `<div class="total-line">${esc(doc.total)}</div>` : ''}
  ${proposalBlock}
</section>

<section class="terms-section">
  <h2>Наличие и доставка</h2>
  <table class="grid terms"><thead><tr><th>Поставщик</th><th class="num">Доставка</th><th>Наличие и срок</th></tr></thead><tbody>${termsRows}</tbody></table>
</section>

<footer class="prepared">
  <div class="signs">
    ${signatureField('Подготовил', doc.preparedBy)}
    ${signatureField('Дата', new Date().toLocaleDateString('ru-RU'))}
  </div>
</footer>
</body></html>`;
}

// Письмо руководителю: только «Предложение на утверждение» и краткая
// сводка по каждой позиции (кто ещё предлагал и почём). Inline-стили,
// таблицы — иначе Gmail/Outlook разваливают вёрстку.
export function buildProposalEmailHtml(doc: ComparisonDoc, message: string): { html: string; text: string } {
  const { request, positions, columnById, picked, pickedCells, pickedOfferIds, pickedDelivery, rate } = doc;
  const td = 'padding:6px 8px;border-bottom:1px solid #e7e5e2;vertical-align:top;font-size:13px;';
  const th = 'padding:6px 8px;border-bottom:2px solid #14151a;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b6d76;';
  const muted = 'display:block;color:#6b6d76;font-size:12px;';
  const num = 'text-align:right;white-space:nowrap;';
  const tagStyle: Record<PurchaseItemMatchKind, string> = {
    exact: 'background:#e6f6ed;color:#157f42;',
    alternative: 'background:#fbf1de;color:#906721;',
    check: 'background:#fce9eb;color:#d21e34;',
    delivery: 'background:#f5f4f2;color:#6b6d76;',
    none: 'background:#f5f4f2;color:#9a9ba1;',
  };
  const tag = (kind: PurchaseItemMatchKind) =>
    `<span style="display:inline-block;border-radius:20px;padding:0 7px;font-size:11px;font-weight:600;${tagStyle[kind]}">${esc(kindLabel(kind))}</span>`;
  const lnk = 'color:#14151a;';

  const rows = picked
    .map(({ position, cell }) => {
      if (!cell) return `<tr><td style="${td}color:#9a9ba3;">${esc(position.name)}<span style="${muted}">${qty(position)}</span></td><td style="${td}" colspan="4">не отобрано</td></tr>`;
      const offer = columnById.get(cell.offerId)?.offer;
      return (
        `<tr><td style="${td}">${esc(position.name)}<span style="${muted}">${qty(position)}</span></td>` +
        `<td style="${td}">${esc(offer?.name ?? '')}</td>` +
        `<td style="${td}">${tag(cell.kind)}${cell.note ? `<span style="${muted}">${withLinks(cell.note, lnk)}</span>` : ''}${cell.productUrl ? `<span style="${muted}">${linkHtml(cell.productUrl, lnk)}</span>` : ''}</td>` +
        `<td style="${td}${num}">${esc(formatUnit(cell.unitPrice, cell.currency))} / ${esc(position.unit || 'ед.')}${emailGoodsUnitPrice(cell, position, muted)}</td>` +
        `<td style="${td}${num}font-weight:600;">${esc(formatMoney(cell.unitPrice * (position.quantity ?? 0), cell.currency))}</td></tr>`
      );
    })
    .join('');
  const deliveryRow =
    pickedDelivery.length > 0
      ? `<tr><td style="${td}" colspan="4">Доставка: ${esc(deliveryNames(doc))}</td><td style="${td}${num}font-weight:600;">${esc(sumMoney(pickedDelivery, rate))}</td></tr>`
      : '';

  const html = `<div style="font-family:Montserrat,Arial,sans-serif;color:#14151a;max-width:760px;">
${message.trim() ? `<p style="white-space:pre-wrap;font-size:14px;line-height:1.45;">${esc(message.trim())}</p>` : ''}
<h2 style="font-size:18px;margin:16px 0 2px;">${esc(request.title)}: предложение на утверждение</h2>
<p style="margin:0 0 10px;color:#6b6d76;font-size:12px;">${request.sectionTitle ? `Раздел сметы «${esc(request.sectionTitle)}» · ` : ''}цены с НДС × объём ведомости · ${new Date().toLocaleDateString('ru-RU')}</p>
<p style="font-size:24px;font-weight:700;color:#157f42;margin:0 0 10px;">${esc(doc.total)}</p>
<table style="border-collapse:collapse;width:100%;" cellpadding="0" cellspacing="0">
<thead><tr><th style="${th}">Позиция ведомости</th><th style="${th}">Поставщик</th><th style="${th}">Соответствие</th><th style="${th}${num}">Цена</th><th style="${th}${num}">Сумма</th></tr></thead>
<tbody>${rows}${deliveryRow}</tbody>
<tfoot><tr><td style="${td}border-top:2px solid #14151a;border-bottom:0;font-weight:600;" colspan="4">Итого к утверждению, с НДС</td><td style="${td}${num}border-top:2px solid #14151a;border-bottom:0;font-weight:700;font-size:16px;color:#157f42;">${esc(doc.total)}</td></tr></tfoot>
</table>
<p style="color:#6b6d76;font-size:12px;">${pickedCells.length} из ${positions.length} позиций · поставщиков: ${pickedOfferIds.size}. Ответьте на это письмо: «утверждаю» или что нужно уточнить.</p>
<p style="margin-top:18px;color:#6b6d76;font-size:12px;">Подготовил: ${esc(doc.preparedBy)}</p>
</div>`;

  const text =
    (message.trim() ? message.trim() + '\n\n' : '') +
    `${request.title}: предложение на утверждение, ${doc.total}\n\n` +
    picked
      .map(({ position, cell }) =>
        cell
          ? `- ${position.name} (${position.quantity ?? '—'} ${position.unit}): ${columnById.get(cell.offerId)?.offer.name ?? ''}, ${formatUnit(cell.unitPrice, cell.currency)}/${position.unit || 'ед.'}, ${kindLabel(cell.kind)}${cell.note ? `, ${cell.note}` : ''} = ${formatMoney(cell.unitPrice * (position.quantity ?? 0), cell.currency)}`
          : `- ${position.name}: не отобрано`,
      )
      .join('\n') +
    (pickedDelivery.length > 0 ? `\n- Доставка: ${sumMoney(pickedDelivery, rate)}` : '') +
    `\n\nИтого к утверждению, с НДС: ${doc.total}\nПодготовил: ${doc.preparedBy}`;

  return { html, text };
}
