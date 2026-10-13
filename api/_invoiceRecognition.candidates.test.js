import { describe, expect, it } from 'vitest';
import { pickInvoiceCandidates } from './_invoiceRecognition.js';

function file(fileName, extra = {}) {
  return { url: `https://example.test/${fileName}`, fileName, pageCount: 1, size: 80_000, ...extra };
}

const SANTECH_OURS = ['Трубы и арматура.xlsx', 'Карточка организации — ООО Матрёшка.docx', 'Адрес доставки.docx'];

describe('pickInvoiceCandidates', () => {
  it('берёт PDF, который письмо называет номером, раньше наших же вложений', () => {
    const attachments = [
      file('image001.jpg', { size: 4_000 }),
      file('Трубы и арматура.xlsx'),
      file('Карточка организации — ООО Матрёшка.docx'),
      file('Адрес доставки.docx'),
      file('22547946.pdf'),
    ];
    const candidates = pickInvoiceCandidates(attachments, {
      subject: 'FW: Запрос цен: трубы и арматура 22547946',
      body: 'Добрый день! Счет во вложении 22547946',
      knownFileNames: SANTECH_OURS,
    });
    expect(candidates.map((a) => a.fileName)[0]).toBe('22547946.pdf');
    expect(candidates.skipped.map((s) => s.fileName)).toEqual(expect.arrayContaining(['image001.jpg', 'Адрес доставки.docx']));
  });

  it('без контекста по-прежнему ставит файл со словом «счёт» впереди', () => {
    const candidates = pickInvoiceCandidates([
      file('photo.png', { size: 200_000 }),
      file('Счет на оплату.pdf'),
      file('notes.docx'),
    ]);
    expect(candidates[0].fileName).toBe('Счет на оплату.pdf');
  });
});
