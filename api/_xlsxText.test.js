import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { extractXlsxText } from './_xlsxText.js';

async function workbook(sheet, styles) {
  const zip = new JSZip();
  zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>${sheet}</sheetData></worksheet>`);
  zip.file('xl/sharedStrings.xml', '<sst><si><t>Цена за шт</t></si></sst>');
  if (styles) zip.file('xl/styles.xml', styles);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('extractXlsxText', () => {
  it('сохраняет рубли из формата ячеек Ultrawood, включая переопределённый встроенный id', async () => {
    const file = await workbook(
      '<row><c s="1" t="s"><v>0</v></c></row>' +
      '<row><c s="1"><v>250</v></c><c><v>2000</v></c></row>' +
      '<row><c s="1"><v>280</v></c><c><v>2440</v></c></row>',
      '<styleSheet><numFmts><numFmt numFmtId="8" formatCode="#,##0.00 &quot;₽&quot;"/></numFmts>' +
      '<cellStyleXfs><xf numFmtId="8"/></cellStyleXfs>' +
      '<cellXfs><xf numFmtId="0"/><xf numFmtId="8"/></cellXfs></styleSheet>',
    );
    expect(await extractXlsxText(file)).toBe(
      'Цена за шт\n250 (формат Excel: #,##0.00 "₽")\t2000\n280 (формат Excel: #,##0.00 "₽")\t2440',
    );
  });

  it('сохраняет явные форматы разных валют и кэш формулы без исполнения формул', async () => {
    const file = await workbook(
      '<row><c s="0"><f>SUM(A2:A3)</f><v>530</v></c><c s="1"><v>12.5</v></c><c s="2"><v>9</v></c></row>',
      '<styleSheet><numFmts><numFmt numFmtId="165" formatCode="[$₽-419]0.00"/>' +
      '<numFmt numFmtId="166" formatCode="0.00 &quot;EUR&quot;"/>' +
      '<numFmt numFmtId="167" formatCode="0.00 &quot;BYN&quot;"/></numFmts>' +
      '<cellXfs><xf numFmtId="165"/><xf numFmtId="166"/><xf numFmtId="167"/></cellXfs></styleSheet>',
    );
    expect(await extractXlsxText(file)).toBe(
      '530 (формат Excel: [$₽-419]0.00)\t12.5 (формат Excel: 0.00 "EUR")\t9 (формат Excel: 0.00 "BYN")',
    );
  });

  it('не выдумывает валюту из локализуемого встроенного формата и не меняет текст, пустые ячейки и ошибки', async () => {
    const file = await workbook(
      '<row><c s="0"><v>0</v></c><c s="1" t="inlineStr"><is><t>Профиль</t></is></c>' +
      '<c s="1"/><c s="1" t="e"><v>#VALUE!</v></c><c s="1" t="str"><v>280</v></c></row>',
      '<styleSheet><numFmts><numFmt numFmtId="165" formatCode="0 &quot;₽&quot;"/></numFmts>' +
      '<cellXfs><xf numFmtId="8"/><xf numFmtId="165"/></cellXfs></styleSheet>',
    );
    expect(await extractXlsxText(file)).toBe('0\tПрофиль\t\t#VALUE!\t280');
  });

  it('читает книгу без styles.xml как раньше', async () => {
    const file = await workbook('<row><c t="s"><v>0</v></c><c><v>250</v></c></row>');
    expect(await extractXlsxText(file)).toBe('Цена за шт\t250');
  });
});
