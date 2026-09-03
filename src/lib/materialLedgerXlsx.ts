import type { PurchaseItem } from '../data/purchases';

// Генерация .xlsx ведомости материалов для вложения в письмо поставщику
// (владелец, 2026-09-03: "система генерирует эксель-табличку с материалами
// и количеством"). ВАЖНО про выбор библиотеки: у пакета xlsx (SheetJS) есть
// известные высокие CVE (prototype pollution, ReDoS) — но обе живут ИСКЛЮЧИТЕЛЬНО
// в чтении/парсинге чужого .xlsx (XLSX.read/readFile), который здесь никогда
// не вызывается. Используем только запись (aoa_to_sheet + write) над данными,
// которые сами же и собрали, поэтому эти CVE к этому коду не применимы —
// держать в голове при апдейте зависимости и не начинать вызывать XLSX.read
// в этом файле без пересмотра этого решения.
//
// Импорт динамический (не статический `import * as XLSX`) — библиотека
// весит ~280 КБ минифицированной, а страница "Поставщики" грузится с
// админки лениво уже целиком (см. App.tsx); статический импорт раздувал бы
// этот один чанк на каждое открытие страницы, даже если ведомость ни разу
// не понадобится. Так xlsx подгружается только по клику "Прикрепить".
export interface LedgerAttachment {
  fileName: string;
  contentType: string;
  contentBase64: string;
}

// Владелец, 2026-09-03: "не хватает столбца Цена за шт, Общей суммы по
// позиции (по формуле) и итого суммы по поставке внизу таблицы" — "Цена"
// остаётся пустой ячейкой (заполняет поставщик, как и раньше), "Сумма" и
// итоговая строка — настоящие формулы Excel/Sheets (не готовое число),
// чтобы при простановке цены сумма посчиталась сама, без повторной
// генерации файла.
export async function buildMaterialLedgerXlsx(ledgerName: string, items: PurchaseItem[]): Promise<LedgerAttachment> {
  const XLSX = await import('xlsx');
  const headerRow = ['Позиция', 'Ед.', 'Кол-во', 'Цена за шт.', 'Сумма'];
  const rows: (string | number)[][] = [
    headerRow,
    ...items.map((i) => [i.name, i.unit || '', i.quantity ?? '', '', '']),
  ];
  if (items.length > 0) {
    rows.push(['', '', '', 'Итого', '']);
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];

  // aoa_to_sheet не умеет формулы напрямую — заполненные выше пустые ячейки
  // "Сумма"/"Итого" перезаписываем объектом {t:'n', f: '<формула>'} с тем же
  // адресом. Строки Excel 1-based, colidx 4 — "Сумма" (0-based E). v:0 —
  // ОБЯЗАТЕЛЬНОЕ кэшированное значение: проверено вживую — без него
  // XLSX.write молча выбрасывает ячейку из файла целиком (ни формулы, ни
  // самой ячейки не остаётся), Excel/Sheets всё равно пересчитают при
  // открытии, реальное число не важно.
  items.forEach((_, i) => {
    const excelRow = i + 2; // +1 на заголовок, +1 на 1-based
    const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: 4 });
    sheet[cellRef] = { t: 'n', v: 0, f: `C${excelRow}*D${excelRow}` };
  });
  if (items.length > 0) {
    const totalRef = XLSX.utils.encode_cell({ r: items.length + 1, c: 4 });
    sheet[totalRef] = { t: 'n', v: 0, f: `SUM(E2:E${items.length + 1})` };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Ведомость');
  const contentBase64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }) as string;
  const safeName = ledgerName.trim() || 'Ведомость материалов';
  return {
    fileName: `${safeName}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentBase64,
  };
}
