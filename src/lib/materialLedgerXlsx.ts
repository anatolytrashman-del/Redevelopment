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

export async function buildMaterialLedgerXlsx(ledgerName: string, items: PurchaseItem[]): Promise<LedgerAttachment> {
  const XLSX = await import('xlsx');
  const rows: (string | number)[][] = [
    ['Позиция', 'Ед.', 'Кол-во', 'Цена'],
    ...items.map((i) => [i.name, i.unit || '', i.quantity ?? '', '']),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
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
