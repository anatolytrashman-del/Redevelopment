import type { EstimateMaterial } from '../../data/estimates';
import type { ExchangeRate } from '../../data/exchangeRates';
import { PURCHASE_ITEM_MATCH_KIND_LABELS, type PurchaseItemMatchKind } from '../../data/purchases';
import { PROPOSAL_REVIEW_STATUS_LABELS, type SupplierRequest } from '../../data/supplierResearch';
import {
  deltaToPicked,
  formatDelta,
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
  return kind === 'exact' ? 'ровно' : PURCHASE_ITEM_MATCH_KIND_LABELS[kind];
}

function deliveryNames(doc: ComparisonDoc): string {
  return [...doc.pickedOfferIds]
    .filter((id) => doc.columnById.get(id)?.delivery != null)
    .map((id) => doc.columnById.get(id)!.offer.name)
    .join(', ');
}

function statusLine(doc: ComparisonDoc): string {
  const review = doc.request.review;
  if (!review || review.status === 'draft') return '';
  const parts = [PROPOSAL_REVIEW_STATUS_LABELS[review.status]];
  if (review.sentAt) parts.push(`отправлено ${new Date(review.sentAt).toLocaleDateString('ru-RU')}${review.sentTo ? ` (${review.sentTo})` : ''}`);
  if (review.decidedAt) parts.push(`решение ${new Date(review.decidedAt).toLocaleDateString('ru-RU')}`);
  if (review.comment) parts.push(`«${review.comment}»`);
  return parts.join(' · ');
}

export function buildPrintHtml(doc: ComparisonDoc): string {
  const { request, positions, columns, columnById, picked, pickedCells, pickedOfferIds, pickedDelivery, kinds, funnel, rate } = doc;
  const kindTag = (kind: PurchaseItemMatchKind) => `<span class="tag ${kind}">${esc(kindLabel(kind))}</span>`;

  const proposalRows = picked
    .map(({ position, cell }) => {
      if (!cell) {
        return `<tr class="empty"><td>${esc(position.name)}<span class="muted">${qty(position)}</span></td><td colspan="4">не отобрано</td></tr>`;
      }
      const offer = columnById.get(cell.offerId)?.offer;
      return (
        `<tr class="picked"><td>${esc(position.name)}<span class="muted">${qty(position)}</span></td>` +
        `<td>${esc(offer?.name ?? '')}</td>` +
        `<td>${kindTag(cell.kind)}${cell.note ? `<span class="muted">${withLinks(cell.note)}</span>` : ''}${cell.productUrl ? `<span class="muted">${linkHtml(cell.productUrl)}</span>` : ''}</td>` +
        `<td class="num">${esc(formatUnit(cell.unitPrice, cell.currency))}</td>` +
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
           <thead><tr><th>Позиция ведомости</th><th>Поставщик</th><th>Соответствие</th><th class="num">Цена за ед.</th><th class="num">Сумма</th></tr></thead>
           <tbody>${proposalRows}${deliveryRow}</tbody>
           <tfoot><tr><td colspan="4">Итого к утверждению, с НДС</td><td class="num total">${esc(doc.total)}</td></tr></tfoot>
         </table>
         <p class="note">${pickedCells.length} из ${positions.length} позиций · поставщиков: ${pickedOfferIds.size} · ровно по ведомости ${kinds.exact ?? 0}, аналогов ${kinds.alternative ?? 0}, требуют уточнения ${kinds.check ?? 0}.</p>`;

  const comparisonBlocks = positions
    .map((p) => {
      const offered = columns.filter((c) => c.cells.has(p.id));
      const pickedCell = pickedCells.find((x) => x.position.id === p.id)?.cell ?? null;
      const missing = columns.filter((c) => !c.cells.has(p.id)).map((c) => `${c.offer.name}${c.unmatched.length ? ' (строки не сопоставлены)' : ''}`);
      const sorted = [...offered].sort((a, b) => (a.cells.get(p.id)!.usdUnit ?? a.cells.get(p.id)!.unitPrice) - (b.cells.get(p.id)!.usdUnit ?? b.cells.get(p.id)!.unitPrice));
      const rows = sorted
        .map((c) => {
          const cell = c.cells.get(p.id)!;
          const isPicked = pickedCell?.offerId === c.offer.id;
          const delta = pickedCell && !isPicked ? deltaToPicked(cell, pickedCell) : null;
          const flags = [
            cell.isArchived ? `архив${cell.quoteDate ? `, счёт от ${new Date(cell.quoteDate).toLocaleDateString('ru-RU')}` : ''}` : '',
            cell.excludedFromSupply ? 'не покупаем — цена для справки' : '',
          ].filter(Boolean);
          return (
            `<tr class="${isPicked ? 'picked' : ''}"><td>${esc(c.offer.name)}${isPicked ? '<span class="pick">✓ на утверждение</span>' : ''}</td>` +
            `<td>${kindTag(cell.kind)}${cell.note ? `<span class="muted">${withLinks(cell.note)}</span>` : ''}${cell.productUrl ? `<span class="muted">${linkHtml(cell.productUrl)}</span>` : ''}${flags.length ? `<span class="muted warn">${esc(flags.join(' · '))}</span>` : ''}</td>` +
            `<td class="num">${esc(formatUnit(cell.unitPrice, cell.currency))}${delta != null ? `<span class="muted">${esc(formatDelta(delta))} к отобранному</span>` : ''}</td>` +
            `<td class="num strong">${esc(formatMoney(cell.unitPrice * (p.quantity ?? 0), cell.currency))}</td></tr>`
          );
        })
        .join('');
      const exactCount = offered.filter((c) => c.cells.get(p.id)!.kind === 'exact').length;
      return `<section class="block">
          <h3>${esc(p.name)} <span class="qty">${qty(p)}</span></h3>
          ${p.note ? `<p class="note">${withLinks(p.note)}</p>` : ''}
          ${offered.length > 0 && exactCount === 0 ? '<p class="note warn">Ровно по ведомости не предложил никто — только аналоги или расхождения.</p>' : ''}
          ${
            offered.length === 0
              ? '<p class="note">Цену на эту позицию не дал никто из приславших КП.</p>'
              : `<table class="grid"><thead><tr><th>Поставщик</th><th>Что предлагают</th><th class="num">Цена за ед.</th><th class="num">На объём</th></tr></thead><tbody>${rows}</tbody></table>`
          }
          ${missing.length > 0 ? `<p class="note">Не предложили: ${esc(missing.join(', '))}.</p>` : ''}
        </section>`;
    })
    .join('');

  const termsRows = columns
    .map(
      (c) =>
        `<tr><td>${esc(c.offer.name)}${c.lastQuoteAt ? `<span class="muted">счёт от ${new Date(c.lastQuoteAt).toLocaleDateString('ru-RU')}</span>` : ''}</td>` +
        `<td>${c.delivery != null ? esc(formatMoney(c.delivery, c.deliveryCurrency)) : 'в счёте нет'}</td>` +
        `<td>${c.offer.termsNote ? withLinks(c.offer.termsNote) : '—'}</td></tr>`,
    )
    .join('');

  const signatureField = (caption: string, value = '') =>
    `<div class="sign"><div class="line">${esc(value)}</div><div class="cap">${esc(caption)}</div></div>`;

  const status = statusLine(doc);

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>${esc(request.title)} — предложение на утверждение</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  @font-face { font-family: 'Montserrat'; src: url('/fonts/Montserrat-Regular.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  @font-face { font-family: 'Montserrat'; src: url('/fonts/Montserrat-SemiBold.woff2') format('woff2'); font-weight: 600 700; font-display: swap; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #fff; color: #14151a; font-family: 'Montserrat', system-ui, sans-serif; font-size: 9.5pt; line-height: 1.35; }
  h1 { font-size: 17pt; margin: 0; letter-spacing: -.01em; }
  h2 { font-size: 12pt; margin: 0 0 6px; break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 0 0 4px; break-after: avoid; }
  h3 .qty { font-weight: 400; color: #6b6d76; }
  header { border-bottom: 2px solid #14151a; padding-bottom: 8px; margin-bottom: 12px; }
  .brand { font-size: 8pt; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: #9a9ba3; }
  .sub { color: #6b6d76; margin-top: 3px; }
  .status { margin-top: 4px; font-weight: 600; color: #157f42; }
  .block { break-inside: avoid; margin-bottom: 12px; }
  .funnel { display: flex; gap: 10px; margin-bottom: 12px; }
  .funnel div { flex: 1; border: 1px solid #e7e5e2; border-radius: 6px; padding: 6px 8px; }
  .funnel b { display: block; font-size: 14pt; line-height: 1.1; }
  .funnel span { color: #6b6d76; font-size: 8pt; }
  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.grid th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #6b6d76; font-weight: 600; border-bottom: 1px solid #d8d6d2; padding: 4px 6px; }
  table.grid td { border-bottom: 1px solid #e7e5e2; padding: 5px 6px; vertical-align: top; word-wrap: break-word; }
  table.grid td.num, table.grid th.num { text-align: right; white-space: nowrap; width: 17%; }
  table.grid td.strong { font-weight: 600; }
  table.grid tfoot td { border-top: 1.5px solid #14151a; border-bottom: 0; font-weight: 600; padding-top: 6px; }
  td.total { font-size: 12pt; color: #157f42; }
  tr.picked td { background: #e6f6ed; }
  tr.empty td { color: #9a9ba3; }
  .muted { display: block; color: #6b6d76; font-size: 8.5pt; }
  .pick { display: block; color: #157f42; font-weight: 600; font-size: 8pt; }
  .tag { display: inline-block; border-radius: 20px; padding: 0 6px; font-size: 8pt; font-weight: 600; }
  .tag.exact { background: #e6f6ed; color: #157f42; }
  .tag.alternative { background: #fbf1de; color: #906721; }
  .tag.check { background: #fce9eb; color: #d21e34; }
  .tag.delivery { background: #f5f4f2; color: #6b6d76; }
  .lnk { color: #14151a; text-decoration: none; border-bottom: 1px dotted #9a9ba3; }
  .note { color: #6b6d76; margin: 6px 0 0; font-size: 8.5pt; }
  .note.warn { color: #906721; }
  .total-line { font-size: 20pt; font-weight: 700; color: #157f42; margin: 2px 0 8px; }
  .signs { display: flex; gap: 14px; margin-top: 14px; break-inside: avoid; }
  .sign { flex: 1; }
  .sign .line { border-bottom: 1px solid #d8d6d2; min-height: 22px; padding-bottom: 2px; }
  .sign .cap { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; color: #9a9ba3; margin-top: 3px; }
  .compare { break-before: page; }
</style></head><body>
<header>
  <div class="brand">Redevelopment · Закупки · Сравнение цен</div>
  <h1>${esc(request.title)}</h1>
  <div class="sub">${request.sectionTitle ? `Раздел сметы «${esc(request.sectionTitle)}», ` : ''}${positions.length} позиций · ${esc(doc.country)} · цены за единицу сметы с НДС × объём ведомости · сформировано ${new Date().toLocaleDateString('ru-RU')}</div>
  ${status ? `<div class="status">${esc(status)}</div>` : ''}
</header>

<div class="funnel">
  <div><b>${funnel.sent}</b><span>запрос отправлен${funnel.letters ? `, ${funnel.letters} писем` : ''}</span></div>
  <div><b>${funnel.replied}</b><span>ответили, ${funnel.repliedNoQuote} без КП</span></div>
  <div><b>${funnel.confirmed}</b><span>прислали КП, ${funnel.quotesCount} счетов</span></div>
  <div><b>${funnel.pricedPositions} из ${positions.length}</b><span>позиций с ценой</span></div>
</div>

<section class="block">
  <h2>Предложение на утверждение</h2>
  ${pickedCells.length > 0 ? `<div class="total-line">${esc(doc.total)}</div>` : ''}
  ${proposalBlock}
  <div class="signs">
    ${signatureField('Подготовил', doc.preparedBy)}
    ${signatureField('Дата', new Date().toLocaleDateString('ru-RU'))}
    ${signatureField('Руководитель стройки, подпись')}
    ${signatureField('Дата')}
  </div>
  <div class="signs">${signatureField('Решение: утвердить / вернуть на уточнение, комментарий')}</div>
</section>

<div class="compare">
  <h2>Все предложения по позициям</h2>
  ${comparisonBlocks}
</div>

<section class="block">
  <h2>Наличие, сроки и доставка</h2>
  <table class="grid"><thead><tr><th>Поставщик</th><th class="num">Доставка</th><th>Что написал менеджер</th></tr></thead><tbody>${termsRows}</tbody></table>
</section>
</body></html>`;
}

// Письмо руководителю: только «Предложение на утверждение» и краткая
// сводка по каждой позиции (кто ещё предлагал и почём). Inline-стили,
// таблицы — иначе Gmail/Outlook разваливают вёрстку.
export function buildProposalEmailHtml(doc: ComparisonDoc, message: string): { html: string; text: string } {
  const { request, positions, columns, columnById, picked, pickedCells, pickedOfferIds, pickedDelivery, rate } = doc;
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
        `<td style="${td}${num}">${esc(formatUnit(cell.unitPrice, cell.currency))}</td>` +
        `<td style="${td}${num}font-weight:600;">${esc(formatMoney(cell.unitPrice * (position.quantity ?? 0), cell.currency))}</td></tr>`
      );
    })
    .join('');
  const deliveryRow =
    pickedDelivery.length > 0
      ? `<tr><td style="${td}" colspan="4">Доставка: ${esc(deliveryNames(doc))}</td><td style="${td}${num}font-weight:600;">${esc(sumMoney(pickedDelivery, rate))}</td></tr>`
      : '';

  const alternatives = positions
    .map((p) => {
      const offered = columns.filter((c) => c.cells.has(p.id));
      if (offered.length === 0) return '';
      const pickedCell = pickedCells.find((x) => x.position.id === p.id)?.cell ?? null;
      const items = [...offered]
        .sort((a, b) => (a.cells.get(p.id)!.usdUnit ?? a.cells.get(p.id)!.unitPrice) - (b.cells.get(p.id)!.usdUnit ?? b.cells.get(p.id)!.unitPrice))
        .map((c) => {
          const cell = c.cells.get(p.id)!;
          const isPicked = pickedCell?.offerId === c.offer.id;
          const delta = pickedCell && !isPicked ? deltaToPicked(cell, pickedCell) : null;
          const flags = [
            cell.isArchived ? `архив${cell.quoteDate ? `, счёт от ${new Date(cell.quoteDate).toLocaleDateString('ru-RU')}` : ''}` : '',
            cell.excludedFromSupply ? 'не покупаем — цена для справки' : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return `<li style="margin:2px 0;${isPicked ? 'font-weight:600;color:#157f42;' : ''}">${esc(c.offer.name)} — ${esc(formatUnit(cell.unitPrice, cell.currency))}/${esc(p.unit || 'ед.')} ${tag(cell.kind)}${cell.note ? ` <span style="color:#6b6d76;">${withLinks(cell.note, lnk)}</span>` : ''}${delta != null ? ` <span style="color:#6b6d76;">(${esc(formatDelta(delta))})</span>` : ''}${flags ? ` <span style="color:#906721;">${esc(flags)}</span>` : ''}${isPicked ? ' ✓' : ''}</li>`;
        })
        .join('');
      return `<p style="margin:10px 0 2px;font-weight:600;font-size:13px;">${esc(p.name)} <span style="font-weight:400;color:#6b6d76;">${qty(p)}</span></p><ul style="margin:0;padding-left:18px;font-size:13px;">${items}</ul>`;
    })
    .join('');

  const html = `<div style="font-family:Montserrat,Arial,sans-serif;color:#14151a;max-width:760px;">
${message.trim() ? `<p style="white-space:pre-wrap;font-size:14px;line-height:1.45;">${esc(message.trim())}</p>` : ''}
<h2 style="font-size:18px;margin:16px 0 2px;">${esc(request.title)}: предложение на утверждение</h2>
<p style="margin:0 0 10px;color:#6b6d76;font-size:12px;">${request.sectionTitle ? `Раздел сметы «${esc(request.sectionTitle)}» · ` : ''}цены за единицу сметы с НДС × объём ведомости · ${new Date().toLocaleDateString('ru-RU')}</p>
<p style="font-size:24px;font-weight:700;color:#157f42;margin:0 0 10px;">${esc(doc.total)}</p>
<table style="border-collapse:collapse;width:100%;" cellpadding="0" cellspacing="0">
<thead><tr><th style="${th}">Позиция ведомости</th><th style="${th}">Поставщик</th><th style="${th}">Соответствие</th><th style="${th}${num}">Цена за ед.</th><th style="${th}${num}">Сумма</th></tr></thead>
<tbody>${rows}${deliveryRow}</tbody>
<tfoot><tr><td style="${td}border-top:2px solid #14151a;border-bottom:0;font-weight:600;" colspan="4">Итого к утверждению, с НДС</td><td style="${td}${num}border-top:2px solid #14151a;border-bottom:0;font-weight:700;font-size:16px;color:#157f42;">${esc(doc.total)}</td></tr></tfoot>
</table>
<p style="color:#6b6d76;font-size:12px;">${pickedCells.length} из ${positions.length} позиций · поставщиков: ${pickedOfferIds.size}. Ответьте на это письмо: «утверждаю» или что нужно уточнить.</p>
<h3 style="font-size:14px;margin:18px 0 4px;">Все предложения по позициям</h3>
${alternatives}
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
