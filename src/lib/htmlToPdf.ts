// Готовый HTML-документ → скачанный PDF, без диалога печати (владелец,
// 2026-09-17: «делай при клике на кнопку На утверждение сразу загрузку pdf
// файла»).
//
// Почему на клиенте, а не рендером на сервере: на Vercel Hobby занято ровно
// 12 serverless-функций из 12 (см. api/), тринадцатую не завести, а тащить
// chromium внутрь существующей — верный способ уронить работающий endpoint.
// Поэтому документ рисуется в скрытом iframe той же страницы (там уже
// загружены наши шрифты) и режется на страницы А4.
//
// Резать «по линейке» нельзя — владелец, 2026-09-17: «выгрузка в pdf
// разрывает страницу на несколько, учти и адаптируй». Поэтому страницы
// заканчиваются на границах строк таблицы и блоков, а не посреди строки:
// pageCuts выбирает последнюю границу, которая ещё помещается на страницу.

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_X_MM = 12;
const MARGIN_Y_MM = 14;

// Ширина «бумаги» в пикселях рендера. Под неё же сверстан документ: 760 px
// на 186 мм содержимого — примерно 104 dpi, на этом масштабе 9,5pt шрифт
// документа остаётся читаемым и после растеризации.
const PAPER_WIDTH_PX = 760;

// Во сколько раз рендерим мельче/крупнее CSS-пикселя: 2 — компромисс между
// чёткостью букв и весом файла.
const SCALE = 2;

// Элементы, которые нельзя разрывать между страницами.
const UNBREAKABLE = 'tr, .sign-area, .signs, .funnel, header, h1, h2, h3, p, .total-line';

// Неделимый кусок документа: строка таблицы, блок подписей, заголовок.
export interface PageBlock {
  top: number;
  bottom: number;
  // false — после этого куска страницу заканчивать нельзя. Так помечены
  // заголовки: заголовок в самом низу страницы без своей таблицы читается
  // как оборванный документ.
  cutAfter?: boolean;
}

// Точки разреза (в пикселях итоговой картинки). Резать можно только по низу
// неделимого куска И только там, где разрез не проходит ВНУТРИ другого
// такого куска: иначе страница кончается между двумя строками подписей, а
// «решение руководителя» уезжает на следующую страницу в одиночестве.
// Возвращает нижние границы страниц, последняя равна высоте документа.
export function pageCuts(blocks: PageBlock[], totalHeight: number, pageHeight: number): number[] {
  if (!(pageHeight > 0)) return [totalHeight];
  const insideSomething = (y: number) => blocks.some((b) => y > b.top + 0.5 && y < b.bottom - 0.5);
  const candidates = [...new Set(blocks.filter((b) => b.cutAfter !== false).map((b) => b.bottom))]
    .filter((y) => y > 0 && y < totalHeight && !insideSomething(y))
    .sort((a, b) => a - b);
  const cuts: number[] = [];
  let start = 0;
  // Ограничение на случай «кусок выше страницы»: такой всё равно придётся
  // разрезать по линейке, иначе цикл никогда не сдвинется.
  while (totalHeight - start > pageHeight + 1) {
    const limit = start + pageHeight;
    // Не даём странице выродиться в полоску: годятся только границы,
    // отстоящие от начала страницы хотя бы на треть её высоты.
    const minCut = start + pageHeight * 0.3;
    let cut = limit;
    for (const c of candidates) {
      if (c > limit) break;
      if (c >= minCut) cut = c;
    }
    cuts.push(cut);
    start = cut;
  }
  cuts.push(totalHeight);
  return cuts;
}

// Имя файла без того, что ломает сохранение на диск.
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'документ';
}

export async function downloadHtmlAsPdf(html: string, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAPER_WIDTH_PX}px;height:1200px;border:0;opacity:0;`;
  document.body.appendChild(frame);
  try {
    const frameDoc = frame.contentDocument;
    if (!frameDoc) throw new Error('Браузер не дал отрисовать документ — попробуйте ещё раз.');
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();
    await new Promise<void>((resolve) => {
      if (frameDoc.readyState === 'complete') resolve();
      else frame.addEventListener('load', () => resolve(), { once: true });
    });
    // Без загруженного шрифта html2canvas снимет документ системным.
    await frameDoc.fonts?.ready.catch(() => undefined);

    const body = frameDoc.body;
    body.style.width = `${PAPER_WIDTH_PX}px`;
    const totalPx = Math.ceil(body.scrollHeight);
    frame.style.height = `${totalPx}px`;

    const bodyTop = body.getBoundingClientRect().top;
    const blocks: PageBlock[] = [...frameDoc.querySelectorAll<HTMLElement>(UNBREAKABLE)]
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          top: (rect.top - bodyTop) * SCALE,
          bottom: (rect.bottom - bodyTop) * SCALE,
          cutAfter: !el.matches('h1, h2, h3'),
        };
      })
      .filter((b) => Number.isFinite(b.top) && Number.isFinite(b.bottom));

    const canvas = await html2canvas(body, {
      scale: SCALE,
      backgroundColor: '#ffffff',
      width: PAPER_WIDTH_PX,
      windowWidth: PAPER_WIDTH_PX,
      height: totalPx,
    });

    const contentWidthMm = A4_WIDTH_MM - MARGIN_X_MM * 2;
    const contentHeightMm = A4_HEIGHT_MM - MARGIN_Y_MM * 2;
    const pxPerMm = canvas.width / contentWidthMm;
    const cuts = pageCuts(blocks, canvas.height, contentHeightMm * pxPerMm);

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    let start = 0;
    cuts.forEach((cut, index) => {
      const sliceHeight = Math.ceil(cut - start);
      if (sliceHeight <= 0) return;
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const ctx = slice.getContext('2d');
      if (!ctx) throw new Error('Браузер не дал собрать страницу PDF.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, -start);
      if (index > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN_X_MM, MARGIN_Y_MM, contentWidthMm, sliceHeight / pxPerMm);
      start = cut;
    });
    // Сохраняем сами, а не pdf.save(): так в загрузках лежит файл с нашим
    // именем, а не «download».
    const url = URL.createObjectURL(pdf.output('blob'));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(filename)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } finally {
    frame.remove();
  }
}
