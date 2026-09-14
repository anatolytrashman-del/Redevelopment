// Логика распознавания счёта/КП, общая для двух путей: (1) автоматически, на
// входящих письмах Ресерча (purchase-email-webhook.js, только offer_id);
// (2) вручную, по клику после загрузки файла в форму предложения
// (supplier-web-search.js, action:'recognize-invoice') — владелец,
// 2026-09-09: "у нас есть поставщик с КП, найденный вручную... загружаем
// КП, система распознаёт КП и записывает цену в базу" (для поставщиков,
// найденных вне переписки в системе — PDF/Excel/скриншот на руках у
// закупщицы, а не через email). Ранний вариант этого второго пути (кнопка
// в предпросмотре ВХОДЯЩЕГО письма) владелец убирал 2026-09-03 ("раз
// система сама распознает данные") — нынешний путь не то же самое:
// не альтернатива автоматике на письмах, а способ ввести КП, которого в
// переписке никогда не было. Отдельный файл с "_" в начале — общий хелпер,
// не считается в лимит 12 serverless-функций Vercel Hobby.
//
// Владелец, 2026-09-03: "делай на Haiku 4.5" (после разбора цены — доли
// цента за документ, см. журнал) + "система [должна] понимать, что перед
// ней счёт, а не каталог на 40 страниц" — отсюда два уровня защиты от
// лишних вызовов модели: (1) estimatePdfPageCount отсекает многостраничные
// файлы ДО обращения к модели вообще (каталог позиций не долетает до
// Haiku, деньги не тратятся); (2) сама модель дополнительно решает
// isInvoice — короткий документ без счёта (например, обычное письмо-
// вложение не по теме) не считается счётом, ничего не подставляется.
import { proxyApiKeyProblem } from './_proxyapi.js';
import { extractDocxText } from './_docxText.js';
import { extractXlsxText } from './_xlsxText.js';
import { invalidInnReason } from './_checko.js';

const MODEL = 'claude-haiku-4-5-20251001';
export const INVOICE_MAX_PAGES = 3;

const SYSTEM_PROMPT = `Ты помогаешь понять, является ли присланный документ счётом или
коммерческим предложением (КП) от поставщика стройматериалов заказчику, и
если да — извлечь из него данные.

Верни ОТВЕТ ЦЕЛИКОМ в виде JSON, без markdown-разметки, без \`\`\`, без
пояснений до или после, строго формат:
{"isInvoice": true или false, "price": число или null, "currency": "USD" или "EUR" или "BYN" или "RUB" или null,
 "supplierInn": "строка цифр" или null,
 "items": [{"name": "строка", "quantity": число или null, "unit": "строка", "price": число или null}]}

isInvoice=false — если это каталог товаров без единой итоговой суммы к
оплате, прайс-лист на много позиций без конкретного предложения клиенту,
или документ вообще не про закупку. isInvoice=true — только когда есть
чёткая итоговая сумма к оплате (счёт, инвойс, коммерческое предложение на
конкретную поставку). price — эта итоговая сумма (с НДС, если он в неё
включён), одно число, не диапазон. Если валюта не указана явно в
документе — верни null, не угадывай по контексту.

supplierInn — ИНН ПОСТАВЩИКА, то есть того, кто выставил счёт и кому уйдут
деньги (в шапке счёта он же «Поставщик», «Исполнитель», «Продавец»,
«Получатель платежа», рядом с расчётным счётом и БИК банка). В счёте почти
всегда ДВА ИНН — второй принадлежит покупателю/плательщику (мы сами), его
возвращать НЕЛЬЗЯ. Только цифры, без пробелов и префикса «ИНН». Не путать
с КПП (9 цифр), БИК (9 цифр), ОГРН (13 или 15 цифр) и номером расчётного
счёта (20 цифр): у ИНН ровно 10 цифр у организации или 12 у ИП. Если ИНН
поставщика в документе не указан или непонятно, чей из двух — верни null,
угадывать не нужно. items — позиции
документа, если их можно выделить построчно; если документ не разбит на
позиции (просто "услуга — сумма") — верни пустой массив, это поле не
обязательно. Никогда не выдумывай числа — если сумму не удаётся уверенно
прочитать, верни isInvoice=false.`;

// Грубая, но бесплатная (без внешних библиотек и без обращения к модели)
// оценка числа страниц PDF по сырым байтам — ищем "/Type /Pages ... /Count N"
// (стандартный узел дерева страниц), при неудаче считаем количество
// объектов "/Type /Page" как более грубый фолбэк. Возвращает null, если
// определить не удалось — в этом случае вызывающий код НЕ считает файл
// кандидатом на автораспознавание (лучше пропустить настоящий счёт, чем
// случайно прогнать через модель нечитаемый файл неизвестного размера).
export function estimatePdfPageCount(bytes) {
  try {
    const text = Buffer.isBuffer(bytes) ? bytes.toString('latin1') : String(bytes ?? '');
    const pagesNodeMatches = [...text.matchAll(/\/Type\s*\/Pages[^>]{0,300}?\/Count\s+(\d+)/g)];
    if (pagesNodeMatches.length > 0) {
      return Math.max(...pagesNodeMatches.map((m) => Number(m[1])));
    }
    const pageObjectMatches = text.match(/\/Type\s*\/Page(?!s)/g);
    return pageObjectMatches ? pageObjectMatches.length : null;
  } catch {
    return null;
  }
}

// Расширения картинок, которые модель умеет читать. .jfif и .jpe — тот же
// JPEG, просто под старыми именами: Outlook и часть веб-клиентов сохраняют
// вставленное в письмо фото именно так. 2026-09-14: реальное вложение
// "4bf2732d-...jfif" (фото 1440x1920 на 800 КБ) не попадало в кандидаты
// вовсе — ни ошибки, ни попытки, потому что .jfif не было ни в одном из
// трёх списков ниже. Держать списки в одном месте, чтобы такое не
// повторилось: добавляя расширение, добавляешь его везде сразу.
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'jfif', 'jpe', 'webp', 'gif'];

function blockTypeForFileName(fileName) {
  const ext = String(fileName || '').split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'document';
  if (IMAGE_EXT.includes(ext)) return 'image';
  return null;
}

// Владелец, 2026-09-09: реальный счёт (ЗАО "Волок", с разбивкой на позиции)
// пришёл файлом .docx — recognizeInvoice его не видела вовсе, ни ошибки, ни
// попытки. 2026-09-12 то же самое повторилось с .xlsx ("Грильято.xlsx" от
// поставщика, лежит в переписке нераспознанным). У Anthropic API нет
// content-блока ни под .docx, ни под .xlsx (document — только PDF), поэтому
// вместо пересылки файла модели передаём уже извлечённый текст (см.
// _docxText.js / _xlsxText.js) обычным text-блоком — для счёта-таблицы
// этого достаточно, реальной картинки/вёрстки документа знать не нужно.
async function buildOfficeContent(fileUrl, fileName, ext) {
  const fileResp = await fetch(fileUrl);
  if (!fileResp.ok) throw new Error(`Не удалось скачать .${ext} для распознавания (${fileResp.status})`);
  const buffer = Buffer.from(await fileResp.arrayBuffer());
  const text = ext === 'xlsx' ? await extractXlsxText(buffer) : await extractDocxText(buffer);
  if (!text.trim()) throw new Error(`Не удалось извлечь текст из .${ext} — файл повреждён или пуст`);
  return [
    {
      type: 'text',
      text: `Текст документа «${fileName}» (столбцы таблиц разделены табуляцией, строки — переносом):\n\n${text}`,
    },
    { type: 'text', text: 'Определи, счёт/КП ли это, и если да — извлеки данные строго по формату из системной инструкции.' },
  ];
}

// fileUrl — публичная ссылка на уже загруженный файл (Supabase Storage). Для
// PDF/картинки модель читает его напрямую по URL; для .docx — сами скачиваем
// и извлекаем текст (см. buildDocxContent).
export async function recognizeInvoice(fileUrl, fileName) {
  const keyProblem = proxyApiKeyProblem();
  if (keyProblem) throw new Error(keyProblem);

  const ext = String(fileName || '').split('.').pop()?.toLowerCase();
  let content;
  if (ext === 'docx' || ext === 'xlsx') {
    content = await buildOfficeContent(fileUrl, fileName, ext);
  } else {
    const blockType = blockTypeForFileName(fileName);
    if (!blockType) throw new Error('Неподдерживаемый тип файла для распознавания — нужен PDF, картинка (png/jpg/webp/gif), .docx или .xlsx');
    content = [
      { type: blockType, source: { type: 'url', url: fileUrl } },
      { type: 'text', text: 'Определи, счёт/КП ли это, и если да — извлеки данные строго по формату из системной инструкции.' },
    ];
  }

  const resp = await fetch('https://api.proxyapi.ru/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.PROXYAPI_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 402) {
      throw new Error('Недостаточно средств на балансе ProxyAPI — пополните счёт в личном кабинете (тот же баланс используют и остальные AI-функции проекта).');
    }
    throw new Error(`Ошибка распознавания (${resp.status}): ${text.slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = (Array.isArray(data.content) ? data.content : [])
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Модель не вернула JSON в ожидаемом формате');
  }
  const parsed = JSON.parse(stripped.slice(start, end + 1));

  return {
    isInvoice: parsed.isInvoice === true,
    price: typeof parsed.price === 'number' ? parsed.price : null,
    currency: typeof parsed.currency === 'string' ? parsed.currency : null,
    // Модель иногда возвращает ИНН с пробелами/префиксом, а иногда путает
    // его с КПП или БИК — чистим и проверяем контрольный разряд прямо
    // здесь. Невалидное значение отбрасываем в null, а не тащим дальше:
    // проверка благонадёжности по чужому/битому ИНН хуже, чем её
    // отсутствие (закупщица увидит зелёный светофор не того юрлица).
    supplierInn: (() => {
      const raw = String(parsed.supplierInn ?? '').replace(/\D/g, '');
      if (!raw) return null;
      return invalidInnReason(raw) ? null : raw;
    })(),
    items: Array.isArray(parsed.items)
      ? parsed.items
          .filter((i) => i && typeof i.name === 'string' && i.name.trim())
          .map((i) => ({
            name: i.name.trim(),
            quantity: typeof i.quantity === 'number' ? i.quantity : null,
            unit: typeof i.unit === 'string' ? i.unit.trim() : '',
            price: typeof i.price === 'number' ? i.price : null,
          }))
      : [],
  };
}


// ─── Выбор вложения, которое имеет смысл распознавать ────────────────────
//
// Владелец, 2026-09-12: "мне нужно автоматическое распознавание счетов и
// запись в базу ещё до открытия письма нами вручную". Первое, что мешало
// этому на живых данных: кандидат выбирался как ПЕРВОЕ подходящее вложение
// письма. Реальное письмо от 2026-09-12 ("RE: Краска интерьерная") пришло с
// четырьмя вложениями — image001.jpg, image002.jpg (картинки из подписи
// отправителя), "Счет на оплату № 84664 от 12.09.2026.pdf" и "Заказ клиента
// № 84664.pdf". Кандидатом становилась картинка подписи, модель честно
// отвечала isInvoice:false — и настоящий счёт из того же письма не
// распознавался вовсе (extraction оставался null).
//
// Отсюда два правила: (1) заведомо служебные картинки отсеиваются ещё до
// модели (имя вида image001.jpg / mailrusigimg_*.png / logo.png, а также
// любая картинка меньше SIGNATURE_IMAGE_MAX_BYTES — подпись/логотип весит
// единицы килобайт, фотография или скан счёта — сотни); (2) оставшиеся
// сортируются по правдоподобию (имя со словом "счёт"/"инвойс"/"КП" вперёд,
// документы перед картинками) и пробуются ПО ОЧЕРЕДИ, пока одно не окажется
// счётом. Перебор ограничен MAX_CANDIDATES — при цене в доли цента за
// документ три попытки ничего не стоят, но и бесконечно перебирать
// двадцативложенную рассылку незачем.
const SIGNATURE_IMAGE_MAX_BYTES = 60 * 1024;
const IMAGE_EXT_RE = new RegExp(`\\.(${IMAGE_EXT.join('|')})$`, 'i');
const SERVICE_IMAGE_NAME = new RegExp(
  `^(image|img|oledata|logo|signature|sig|footer|banner|mailrusigimg|outlook-)[-_a-z0-9]*\\.(${IMAGE_EXT.join('|')})$`,
  'i',
);
const INVOICE_NAME_HINT = /(сч[её]т|invoice|inv[-_ ]?\d|\bкп\b|коммерч|оферт|предложен|quote|proposal|прайс|price)/i;
const RECOGNIZABLE_EXT = new RegExp(`\\.(pdf|docx|xlsx|${IMAGE_EXT.join('|')})$`, 'i');
export const MAX_CANDIDATES = 3;

// 2026-09-14: имя перестало быть самостоятельным основанием отсеять
// картинку. Outlook переименовывает в imageNNN.png ВСЁ, что вставлено в
// тело письма, — и логотип из подписи, и скриншот прайса, который прислал
// менеджер. В базе на этот момент лежали четыре таких письма, где
// "image002.png" (133 КБ), "image011.png" (182 КБ), "image012.png" (156 КБ)
// и "image001.png" (166 КБ) отбрасывались не глядя, хотя картинки из
// подписи в тех же письмах весили 1-3 КБ. Поэтому: размер известен — решает
// он (подпись/логотип это единицы килобайт, скриншот счёта — сотни), и
// только когда размера нет (старое письмо, файл не скачался) в ход идёт имя.
function isServiceImage(attachment) {
  if (!IMAGE_EXT_RE.test(attachment.fileName)) return false;
  const size = typeof attachment.size === 'number' && attachment.size > 0 ? attachment.size : null;
  if (size != null) return size < SIGNATURE_IMAGE_MAX_BYTES;
  return SERVICE_IMAGE_NAME.test(attachment.fileName);
}

// Почему конкретное вложение до модели не дошло — словами, для записи в
// extraction.skipped (см. recognizeInvoiceFromAttachments). Без этого
// "счёт не распознался" неотличимо от "распознавание даже не пробовало", и
// разбор каждой такой жалобы превращается в археологию по коду (ровно это
// и случилось 2026-09-14).
function skipReason(a) {
  if (!a || !a.url) return 'файл не загрузился в хранилище';
  if (!RECOGNIZABLE_EXT.test(a.fileName || '')) return 'тип файла не читается моделью';
  if (a.pageCount == null) return 'не удалось определить число страниц PDF';
  if (a.pageCount > INVOICE_MAX_PAGES) return `страниц ${a.pageCount} — похоже на каталог, не на счёт`;
  if (isServiceImage(a)) return 'картинка из подписи отправителя';
  return null;
}

// attachments — то, что вернул extractEmailAttachments (url/fileName/
// pageCount/size). Возвращает отсортированный список кандидатов (не более
// MAX_CANDIDATES) и список отсеянных с причинами.
export function pickInvoiceCandidates(attachments) {
  const suitable = [];
  const skipped = [];
  for (const a of Array.isArray(attachments) ? attachments : []) {
    const reason = skipReason(a);
    if (reason) skipped.push({ fileName: a?.fileName ?? '(без имени)', reason });
    else suitable.push(a);
  }

  const rank = (a) => {
    const hinted = INVOICE_NAME_HINT.test(a.fileName) ? 0 : 1;
    const isDocument = /\.(pdf|docx|xlsx)$/i.test(a.fileName) ? 0 : 1;
    return hinted * 2 + isDocument;
  };
  const ranked = [...suitable].sort((a, b) => rank(a) - rank(b));
  for (const a of ranked.slice(MAX_CANDIDATES)) {
    skipped.push({ fileName: a.fileName, reason: `дальше ${MAX_CANDIDATES}-го по правдоподобию — не пробовали` });
  }
  const candidates = ranked.slice(0, MAX_CANDIDATES);
  // Свойство, а не отдельный возвращаемый объект: pickInvoiceCandidates
  // вызывается и как обычный список кандидатов (scripts/backfill-invoice-
  // recognition.mjs), ломать её форму ради диагностики не нужно.
  Object.defineProperty(candidates, 'skipped', { value: skipped, enumerable: false });
  return candidates;
}

// Пробует кандидатов по очереди. Возвращает ВСЕГДА объект:
//   { recognized, candidate, attempts, skipped }
// recognized/candidate — первое вложение, признанное счётом (null, если ни
// одно им не оказалось); attempts/skipped — протокол попыток и отсева, он
// уходит в письмо даже при неудаче (см. purchase-email-webhook.js). Ошибка
// на одном кандидате не прекращает перебор: битый .docx в письме не должен
// прятать нормальный PDF рядом.
export async function recognizeInvoiceFromAttachments(attachments) {
  const candidates = pickInvoiceCandidates(attachments);
  const attempts = [];
  for (const candidate of candidates) {
    try {
      const recognized = await recognizeInvoice(candidate.url, candidate.fileName);
      if (recognized.isInvoice) {
        attempts.push({ fileName: candidate.fileName, outcome: 'счёт' });
        return { recognized, candidate, attempts, skipped: candidates.skipped ?? [] };
      }
      attempts.push({ fileName: candidate.fileName, outcome: 'модель не считает это счётом' });
    } catch (err) {
      console.error('Не удалось распознать вложение как счёт:', candidate.fileName, err);
      attempts.push({ fileName: candidate.fileName, outcome: `ошибка: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) });
    }
  }
  return { recognized: null, candidate: null, attempts, skipped: candidates.skipped ?? [] };
}
