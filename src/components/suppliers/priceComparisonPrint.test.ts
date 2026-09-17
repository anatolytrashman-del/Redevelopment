import { describe, expect, it } from 'vitest';
import { approvalPrintTitle, buildPrintHtml, type ComparisonDoc } from './priceComparisonPrint';

function fixture(): ComparisonDoc {
  const position = { id: 'white', name: 'Матовая для потолков кристально белая моющаяся', quantity: 200, unit: 'м2', consumption: 0.2, consumptionUnit: 'л' };
  const cell = { offerId: 'picked', kind: 'exact', unitPrice: 75.13, currency: 'RUB', note: '', productUrl: '' };
  const columns = [
    { offer: { id: 'picked', name: 'Альбия', termsNote: 'Исходные условия' }, delivery: 2500, deliveryCurrency: 'RUB' },
    { offer: { id: 'other', name: 'Не выбранный поставщик' }, delivery: null },
  ];
  // Минимальные данные для проверки границ редакционных изменений отчёта.
  return {
    request: { title: 'Краски, обои и декоративные покрытия', sectionTitle: 'Краски', review: { status: 'approved', decidedAt: '2026-09-17' } },
    estimateTitle: 'Смета Зелёный', country: 'Россия', positions: [position], columns,
    columnById: new Map(columns.map((c) => [c.offer.id, c])),
    picked: [{ position, cell }], pickedCells: [{ position, cell }], pickedOfferIds: new Set(['picked']),
    pickedDelivery: [{ amount: 2500, currency: 'RUB' }], kinds: { exact: 1 },
    funnel: { sent: 19, letters: 56, replied: 12, repliedNoQuote: 0, confirmed: 12, quotesCount: 17 },
    total: '17 526 ₽', preparedBy: 'Автор',
  } as unknown as ComparisonDoc;
}

describe('approval PDF', () => {
  it('keeps selected prices and delivery while removing duplicate totals and unselected suppliers', () => {
    const html = buildPrintHtml(fixture());
    expect(html).toContain('<h1>Поставка красок</h1>');
    expect(html).toContain('Объект: 1-й Геологический проезд, 1, посёлок Зелёный, Московская область');
    expect(html).toContain('подходит под ТЗ');
    expect(html).toContain('75,13 ₽ / м2');
    expect(html).toContain('375,65 ₽ за л');
    expect(html).toContain('Доставка: Альбия');
    expect(html).toContain('Проработано поставщиков:</span><b>19</b>');
    expect(html).not.toContain('Получено КП:');
    expect(html).toContain('<h2>Наличие и доставка</h2>');
    expect(html).not.toContain('Руководитель стройки');
    expect(html).not.toContain('Решение: утвердить');
    expect(html.match(/17 526 ₽/g)).toHaveLength(1);
    expect(html.match(/Все в наличии\. Доставка в течение нескольких дней по запросу/g)).toHaveLength(1);
    for (const removed of ['Не выбранный поставщик', 'Итого к утверждению', 'сформировано', 'решение 17.09.2026', 'из ведомости 1', 'Раздел сметы']) expect(html).not.toContain(removed);
  });

  it('applies the agreed title, address and delivery wording to the Green object plinth report', () => {
    const doc = fixture();
    doc.request = { ...doc.request, title: 'Плинтусы, панели и лепнина', sectionTitle: 'Плинтус' };
    doc.positions[0] = { ...doc.positions[0], name: 'Плинтус Stenopol C7157', quantity: 3540, unit: 'пог. метры' };
    doc.columns[0] = { ...doc.columns[0], offer: { ...doc.columns[0].offer, name: 'DEARTIO' }, delivery: null };
    doc.columnById = new Map(doc.columns.map((c) => [c.offer.id, c]));

    const html = buildPrintHtml(doc);
    expect(approvalPrintTitle(doc)).toBe('Плинтус');
    expect(html).toContain('<h1>Плинтус</h1>');
    expect(html).toContain('Объект: 1-й Геологический проезд, 1, посёлок Зелёный, Московская область');
    expect(html).toContain('<td class="num">В цене</td>');
    expect(html).toContain('<td>В наличии, доставка по запросу</td>');
    expect(html).not.toContain('Получено КП:');
  });

  it.each(['Другая смета', null, undefined])('does not apply paint editorial facts to another or unknown estimate: %s', (estimateTitle) => {
    const doc = { ...fixture(), estimateTitle };
    expect(approvalPrintTitle(doc)).toBe(doc.request.title);
    const html = buildPrintHtml(doc);
    expect(html).not.toContain('Объект:');
    expect(html).not.toContain('Все в наличии');
    expect(html).not.toContain('подходит под ТЗ');
    expect(html).toContain('Исходные условия');
  });

  it('does not turn an uncertain match into compliance with the specification', () => {
    const doc = fixture();
    doc.picked[0].cell!.kind = 'check';
    expect(buildPrintHtml(doc)).not.toContain('подходит под ТЗ');
  });

  it('does not claim availability when nothing has been selected', () => {
    const doc = fixture();
    doc.pickedCells = [];
    doc.pickedOfferIds.clear();
    const html = buildPrintHtml(doc);
    expect(html).toContain('Позиции ещё не отобраны');
    expect(html).not.toContain('Все в наличии');
  });

  it('groups proposal rows by supplier name', () => {
    const doc = fixture();
    const secondPosition = { ...doc.positions[0], id: 'black', name: 'Чёрная краска' };
    const secondCell = { ...doc.picked[0].cell!, offerId: 'other' };
    const thirdPosition = { ...doc.positions[0], id: 'ceiling', name: 'Краска для потолка' };
    const thirdCell = { ...doc.picked[0].cell! };
    doc.picked = [doc.picked[0], { position: secondPosition, cell: secondCell }, { position: thirdPosition, cell: thirdCell }];
    const html = buildPrintHtml(doc);
    expect(html.indexOf('Матовая для потолков кристально белая')).toBeLessThan(html.indexOf('Краска для потолка'));
    expect(html.indexOf('Краска для потолка')).toBeLessThan(html.indexOf('Чёрная краска'));
  });
});
