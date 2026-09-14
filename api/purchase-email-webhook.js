// Vercel serverless function: приём входящих писем через Resend Inbound
// Webhook. Домен/MX/webhook уже настроены владельцем (2026-08-28, см.
// журнал docs/session-journal.md) — этот эндпоинт зарегистрирован в кабинете Resend как
// единственный обработчик входящей почты на домене.
//
// Несмотря на название файла (осталось от первой версии — переименовывать
// не стали, чтобы не заставлять владельца ещё раз лезть в кабинет Resend и
// менять зарегистрированный URL), обрабатывает ДВА разных случая по
// префиксу адреса в "to": zakupki+<код>@ — переписка по закупке
// (purchase_emails), research+<код>@ — переписка по предложению в
// Ресерче поставщиков, ещё до того как оно превратилось в закупку
// (supplier_offer_emails). Resend не даёт настроить доставку webhook по
// конкретному адресу получателя — сюда прилетает вообще любое входящее
// письмо на домене, дальше уже сами решаем, что с ним делать.
//
// <код> — короткий short_code (5 hex-символов), не полный id (владелец,
// 2026-09-03: адрес с UUID был "очень длинный") — извлечённый код нужно
// сначала резолвить в реальный id закупки/предложения отдельным запросом
// (resolveIdByShortCode), сам FK-столбец purchase_id/offer_id как хранил,
// так и хранит настоящий UUID.
//
// Resend подписывает вебхуки по протоколу Svix (заголовки svix-id/
// svix-timestamp/svix-signature, HMAC-SHA256 от "id.timestamp.тело" на
// секрете вебхука) — секрет лежит в Vercel env RESEND_WEBHOOK_SECRET.
// Без проверки подписи любой, кто узнает URL эндпоинта, мог бы подкинуть
// поддельное "письмо от поставщика" прямо в переписку любой закупки —
// поэтому bodyParser отключён (нужно именно СЫРОЕ тело запроса байт-в-байт,
// не пересобранный JSON.stringify, иначе подпись не сойдётся) и подпись
// проверяется до разбора payload. Если RESEND_WEBHOOK_SECRET ещё не
// проставлен в Vercel — проверка пропускается с предупреждением в лог,
// чтобы не сломать приём писем ДО того, как секрет добавят.
//
// ВАЖНО (проверено 2026-09-03 по документации Resend, см. подробный
// комментарий в _attachments.js): сам вебхук email.received несёт только
// метаданные письма (from/to/subject/email_id/attachments-список без
// содержимого) — тела ("text"/"html") в нём НЕТ, его нужно дотягивать
// отдельным GET-запросом к api.resend.com (fetchReceivedEmailBody ниже).
// Раньше здесь ошибочно читалось data.text/data.html прямо из вебхука —
// на первом же реальном письме body сохранился бы пустой строкой.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { extractEmailAttachments, fetchReceivedEmailBody } from './_attachments.js';
import { recognizeAllInvoicesFromAttachments } from './_invoiceRecognition.js';
import { applyRecognizedInvoice, quoteTitle } from './_invoiceApply.js';
import { saveReliabilityIfNew } from './_checko.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

// ВРЕМЯ РАБОТЫ ФУНКЦИИ — не декоративная настройка, а корень реального бага
// (разбор 2026-09-14). У этой функции не было maxDuration, то есть работал
// потолок Vercel по умолчанию — 10 секунд. А делает она последовательно:
// тело письма → скачивание и перезаливка всех вложений → до трёх обращений
// к модели (реальные замеры на живых счетах: 4.4 с и 8.2 с на ОДИН PDF) →
// проверку ИНН в Checko → вставку письма → запись счёта в карточку. На
// тяжёлом письме это 12-20 секунд, и функцию убивали посреди работы — в
// произвольном месте, поэтому симптомы каждый раз разные:
//   • DEARTIO, 14.09 11:19 — письмо вставлено на 10-й секунде, дальше
//     ничего: распознавание осталось pending, владелец подтверждал руками
//     (с этого и начался разбор — "счёт не распознался автоматически");
//   • Грильято/Авангард, 14.09 09:15 — успела пройти запись позиций в
//     карточку, но не строка КП и не отметка в письме;
//   • "RE: Плинтус", 14.09 09:00 — ответа Resend не дождался вовсе,
//     повторил доставку, письмо в базе задвоилось.
// Потолок поднят до 300 с в vercel.json (как у остальных AI-функций), а от
// повторных доставок отдельно защищает emailAlreadyStored ниже.
// Не убирать одно без другого: длинная функция БЕЗ защиты от повтора — это
// ровно задвоенные позиции счёта.

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function verifyResendSignature(rawBody, headers, secret) {
  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const secretBytes = Buffer.from(secret.split('_')[1] || '', 'base64');
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest();

  return String(svixSignature)
    .split(' ')
    .some((part) => {
      const [version, signature] = part.split(',');
      if (version !== 'v1' || !signature) return false;
      let provided;
      try {
        provided = Buffer.from(signature, 'base64');
      } catch {
        return false;
      }
      return provided.length === expected.length && timingSafeEqual(provided, expected);
    });
}

// Владелец, 2026-09-03: "давай заменим адрес на zakupki" — раньше научный
// (research+) и закупочный (zakupki+) адреса были двумя разными префиксами,
// определяющими, в какую таблицу класть письмо. Теперь ОБА принимаются
// одинаково (regex по обоим сразу), а таблица определяется уже не
// префиксом, а тем, в какой из четырёх таблиц реально нашёлся short_code (см.
// вызов ниже). research+ оставлен наравне с zakupki+ НЕ для новых писем
// (см. supplierOfferEmailAddress в data/supplierResearch.ts — она теперь
// сама строит zakupki+), а как совместимость с уже отправленным вживую
// письмом (research+4687a@...) — если поставщик или сотрудник ответят в
// том же треде ещё раз, их почтовый клиент подставит именно старый адрес.
function extractShortCode(toAddress) {
  const re = /(?:zakupki|research)\+([0-9a-f]{4,8})@/i;
  const match = String(toAddress || '').match(re);
  return match ? match[1].toLowerCase() : null;
}

async function resolveIdByShortCode(table, shortCode) {
  const resp = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/${table}?short_code=eq.${encodeURIComponent(shortCode)}&select=id`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows[0]?.id ?? null;
}

// Владелец, 2026-09-03: "1 заявка на поставку — одна ветка" — дополнительные
// заявки (supplier_orders) переписываются по своему собственному
// short_code, но письмо всё равно должно лечь и под правильный offer_id
// (карточка поставщика, к которому эта заявка относится) — нужен id ОБОИХ
// сразу, не одного only order.id, как у остальных resolveIdByShortCode.
async function resolveOrderByShortCode(shortCode) {
  const resp = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/supplier_orders?short_code=eq.${encodeURIComponent(shortCode)}&select=id,offer_id`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows[0] ? { id: rows[0].id, offerId: rows[0].offer_id } : null;
}

// Реальный случай 2026-09-10: у всех 14 предложений массовой рассылки от
// 2026-09-09 short_code в supplier_research_offers оказался ДРУГИМ, чем тот,
// что был зашит в адрес отправителя на момент отправки писем (сверено
// напрямую по базе — sent-адрес из supplier_offer_emails.from_address не
// совпал с offer.short_code НИ У ОДНОЙ из 14 записей). Ни один код проекта
// (insertSupplierOffer/updateSupplierOffer/purchase-send-email.js/этот же
// файл) НЕ пишет в колонку short_code после создания строки — она
// генерируется только DEFAULT-выражением на самой колонке (см. миграцию
// 2026-09-03). Как и почему у всех 14 записей разом разъехалось значение —
// не установлено (не было ни одной правки схемы этой таблицы между
// отправкой и обнаружением бага, судя по журналу docs/session-journal.md) — похоже на
// побочный эффект какой-то структурной миграции колонки где-то между этими
// двумя моментами, а не на баг конкретно этого файла.
//
// Раз причина не подтверждена и не исключён повтор — резолвим по короткому
// коду НЕ ТОЛЬКО через текущее значение offer.short_code, но и через уже
// реально отправленные письма: from_address исходящего письма — это
// неизменяемая историческая запись (колонка никогда не редактируется после
// insertEmailRow), поэтому по ней можно восстановить offer_id даже если
// текущий short_code записи успел уйти в сторону. Вызывается ТОЛЬКО когда
// прямой поиск по offer.short_code ничего не дал — не подменяет основной
// путь, а подстраховывает его.
async function resolveOfferIdByEmailHistory(shortCode) {
  const pattern = `*+${shortCode}@*`;
  const resp = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/supplier_offer_emails?select=offer_id&direction=eq.out&from_address=ilike.${encodeURIComponent(pattern)}&limit=1`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows[0]?.offer_id ?? null;
}

// Заголовок From письма обычно приходит в одном из двух видов —
// "Иван Петров <ivan@company.ru>" или просто "ivan@company.ru" — если
// получится распознать имя, дальше используем его для автозаполнения
// карточки предложения (см. autoFillOfferContact). Не трогает уже
// сложившийся fromAddress (используется как есть в самой записи письма),
// это отдельный best-effort разбор ТОЛЬКО для автозаполнения.
function parseFromHeader(raw) {
  const str = String(raw || '').trim();
  const match = str.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  if (match) {
    const name = match[1].trim();
    return { name: name || null, address: match[2].trim() };
  }
  return { name: null, address: str };
}

// Владелец, 2026-09-03: "давай в эту карточку подтягивать автоматически
// email из письма и имя менеджера из письма" — только для переписки
// Ресерча (offerId), только на ПЕРВОМ входящем письме по факту (если поля
// уже заполнены — ничем не перезаписываем, это может быть другой человек,
// ответивший позже с того же адреса, или владелец мог поправить вручную).
// Сбой здесь не должен ронять сохранение самого письма — вызывающий код
// оборачивает в try/catch.
async function autoFillOfferContact(offerId, parsedFrom) {
  const resp = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/supplier_research_offers?id=eq.${offerId}&select=email,manager_name`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!resp.ok) return;
  const rows = await resp.json();
  const offer = rows[0];
  if (!offer) return;

  const patch = {};
  if (!offer.email && parsedFrom.address) patch.email = parsedFrom.address;
  if (!offer.manager_name && parsedFrom.name) patch.manager_name = parsedFrom.name;
  if (Object.keys(patch).length === 0) return;

  await fetch(`${process.env.SUPABASE_URL}/rest/v1/supplier_research_offers?id=eq.${offerId}`, {
    method: 'PATCH',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
}

// Resend/svix повторяет доставку вебхука, если мы не ответили вовремя —
// а до 2026-09-14 функция регулярно не отвечала вовсе (см. комментарий про
// maxDuration в самом обработчике). Реальный след в базе: письмо "RE:
// Плинтус" от 2026-09-14 лежит ДВАЖДЫ (06:00:54 и 06:02:09, один и тот же
// resend_message_id, вложения перезалиты по второму разу), а у предложения
// "Грильято" 9 позиций счёта записаны дважды подряд — второй прогон
// добавил их к уже добавленным. Поэтому повторная доставка теперь
// отсекается по resend_message_id ДО всей тяжёлой работы: ни лишнего
// распознавания (деньги), ни задвоенных позиций (данные).
//
// При ошибке самой проверки возвращаем false — лучше сохранить письмо
// второй раз, чем потерять его из-за сбоя проверки на дубликат.
async function emailAlreadyStored(table, messageId) {
  try {
    const resp = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/${table}?select=id&direction=eq.in&resend_message_id=eq.${encodeURIComponent(messageId)}&limit=1`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!resp.ok) return false;
    return (await resp.json()).length > 0;
  } catch (err) {
    console.error('Не удалось проверить письмо на повторную доставку (обрабатываем как новое):', err);
    return false;
  }
}

async function insertEmailRow(table, payload) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Не удалось сохранить входящее письмо: ${text}`);
  }
  const rows = await resp.json();
  return rows[0];
}

async function updateEmailExtraction(table, emailId, extraction) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?id=eq.${emailId}`, {
    method: 'PATCH',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ extraction }),
  });
  if (!resp.ok) {
    throw new Error(`Не удалось обновить распознавание письма: ${await resp.text()}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawBody = await readRawBody(req);
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    if (!verifyResendSignature(rawBody, req.headers, secret)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  } else {
    console.warn('RESEND_WEBHOOK_SECRET не настроен — подпись входящего письма не проверяется');
  }

  try {
    const payload = JSON.parse(rawBody || '{}');
    // Resend оборачивает событие в { type, data } — data содержит сами
    // поля письма (to/from/subject/text). Поддерживаем и "плоский" вид на
    // случай отличающегося формата.
    const data = payload.data ?? payload;
    // 2026-09-03: живой прогон сохранил пустое тело и без вложений, хотя
    // отправитель ответил и приложил файл — точная причина ещё не
    // подтверждена (см. комментарий в _attachments.js). Логируем сырой
    // payload целиком, чтобы на следующем реальном письме увидеть в Vercel
    // Runtime Logs, как он выглядит на самом деле.
    console.error('RAW WEBHOOK PAYLOAD:', JSON.stringify(payload).slice(0, 3000));

    const toRaw = data.to;
    const toAddress = Array.isArray(toRaw) ? toRaw[0] : toRaw;
    const fromAddress = data.from ?? '';
    const subject = data.subject ?? '';

    const code = extractShortCode(toAddress);

    if (!code) {
      // Письмо не на наш plus-адрес — не наша забота, но и не ошибка
      // самого вебхука (Resend не должен ретраить бесконечно). Заодно не
      // тратим лишний запрос к Resend API на тело письма, которое всё
      // равно никуда не сохраним.
      res.status(200).json({ skipped: true });
      return;
    }

    // Таблицу определяет не префикс адреса (оба принимаются одинаково, см.
    // extractShortCode), а то, в какой из четырёх таблиц реально нашёлся
    // short_code — проверяются по очереди, коллизия между ними технически
    // возможна, но при таком масштабе (десятки-сотни записей на компанию,
    // не тысячи) статистически ничтожна, отдельно не защищаемся.
    //
    // Владелец, 2026-09-03: "1 заявка на поставку — одна ветка" —
    // дополнительные заявки (supplier_orders) переписываются по своему
    // короткому коду; письмо в этом случае всё равно кладём под настоящий
    // offer_id (карточка поставщика), плюс order_id конкретной заявки.
    const purchaseId = await resolveIdByShortCode('purchases', code);
    const matchedOffer = purchaseId ? null : await resolveIdByShortCode('supplier_research_offers', code);
    const matchedOrder = purchaseId || matchedOffer ? null : await resolveOrderByShortCode(code);
    let offerId = matchedOffer ?? matchedOrder?.offerId ?? null;
    const orderId = matchedOrder?.id ?? null;
    // Четвёртая таблица — подрядчики (вкладка "Подрядчики" страницы
    // "Закупки", владелец 2026-09-14). Проверяется последней из прямых
    // поисков: у поставщиков переписки на порядки больше, незачем на каждом
    // письме ходить сюда первым.
    const contractorId =
      purchaseId || offerId ? null : await resolveIdByShortCode('work_contractors', code);

    // Фолбэк по истории отправленных писем (см. комментарий у
    // resolveOfferIdByEmailHistory) — только когда прямой поиск по всем
    // четырём таблицам ничего не дал.
    if (!purchaseId && !offerId && !contractorId) {
      offerId = await resolveOfferIdByEmailHistory(code);
    }

    if (!purchaseId && !offerId && !contractorId) {
      // Код есть в адресе, но не резолвится ни в одну реальную запись —
      // например, письмо на давно удалённую закупку. Логируем на всякий
      // случай, но так же безобидно скипаем, как и совсем чужой адрес.
      console.warn('Не удалось сопоставить short_code с записью:', code);
      res.status(200).json({ skipped: true });
      return;
    }

    // Повторная доставка того же письма (см. emailAlreadyStored) — отвечаем
    // 200 и ничего не делаем: письмо уже сохранено первым разом.
    const messageId = data.email_id ?? data.id ?? null;
    const targetTable = purchaseId
      ? 'purchase_emails'
      : contractorId
      ? 'work_contractor_emails'
      : 'supplier_offer_emails';
    if (messageId && (await emailAlreadyStored(targetTable, messageId))) {
      console.warn('Повторная доставка вебхука — письмо уже сохранено, пропускаем:', messageId);
      res.status(200).json({ skipped: true, duplicate: true });
      return;
    }

    // Тело письма — отдельным запросом, см. комментарий в начале файла.
    const body = await fetchReceivedEmailBody([data.email_id, data.id]);
    const attachments = await extractEmailAttachments(data);
    const files = attachments.map(({ url, fileName }) => ({ url, fileName }));

    // Автораспознавание счёта/КП во вложении — только для переписки Ресерча
    // (offerId), не закупок. Владелец, 2026-09-03: "система [должна]
    // понимать, что перед ней счёт, а не каталог на 40 страниц, и
    // распознавала данные сама... Альмира только сверяла и подтверждала".
    //
    // 2026-09-12: раньше здесь брался ПЕРВЫЙ подходящий файл письма — на
    // живых письмах этим файлом регулярно оказывалась картинка из подписи
    // отправителя, и настоящий счёт рядом не распознавался вовсе. Теперь
    // выбор и перебор кандидатов внутри recognizeAllInvoicesFromAttachments
    // (см. pickInvoiceCandidates) — служебные картинки отсеиваются, счёт
    // ищется по всем вложениям. Многостраничные каталоги до модели
    // по-прежнему не долетают, деньги не тратятся.
    //
    // 2026-09-14: теперь обрабатываем ВСЕ счёты в письме, а не только первый
    // (реальный случай: письмо от Авангарда с двумя счетами на разные
    // материалы).
    //
    // Сбой распознавания не должен ронять сохранение самого письма —
    // оборачиваем в try/catch, extraction просто остаётся null.
    let extraction = null;
    let recognizedInvoice = null;
    let recognizedInvoicesData = null;
    if (offerId) {
      // status:'none' — "пробовали, счёта не нашли". Раньше при неудаче в
      // письме не оставалось НИЧЕГО, и вопрос владельца "почему обычный счёт
      // не распознался" (2026-09-14) невозможно было закрыть запросом к базе:
      // молчание одинаково означало и "модель решила, что это не счёт", и
      // "до модели файл вообще не дошёл", и "распознавание не запускалось".
      // Теперь в attempts/skipped лежит протокол: что пробовали и что
      // отсеяли с какой причиной. На карточку в переписке этот статус ничего
      // не выводит (см. SupplierCorrespondenceTab) — только для разбора.
      const emptyExtraction = (extra) => ({
        status: 'none',
        isInvoice: false,
        price: null,
        currency: null,
        items: [],
        supplierInn: null,
        sourceFile: null,
        recognizedAt: new Date().toISOString(),
        ...extra,
      });
      try {
        // 2026-09-14: находим ВСЕ счёты в письме, не только первый.
        // Реальный случай (письмо от Авангарда): два счёта на разных видах
        // материалов в одном письме, но при обработке записывался только первый.
        // Тема и текст письма идут к модели справочно: короткая таблица с
        // ценами сама по себе неотличима от куска каталога, а письмо
        // ("направляю коммерческое предложение по вашему запросу") снимает
        // этот вопрос — см. emailContextBlock в _invoiceRecognition.js.
        const result = await recognizeAllInvoicesFromAttachments(attachments, { subject, body });
        recognizedInvoicesData = result;
        if (result.allRecognized && result.allRecognized.length > 0) {
          // ПЕРВЫЙ счёт лежит прямо в корне extraction, остальные — в
          // additionalInvoices. Это не "для диагностики", а рабочая форма
          // хранения: интерфейс читает оба места одним списком (см.
          // extractionInvoices в data/supplierOfferEmails.ts), а корень
          // оставлен первым счётом, чтобы записи, сделанные до появления
          // нескольких счетов, читались тем же кодом.
          const [firstInvoice, ...restInvoices] = result.allRecognized;
          recognizedInvoice = firstInvoice;
          const { recognized, candidate } = firstInvoice;
          // duplicateFiles — вложения, оказавшиеся тем же самым счётом
          // (счёт + "заказ клиента" одним комплектом, см.
          // recognizeAllInvoicesFromAttachments). Отдельной строкой КП они
          // не становятся, но в переписке помечаются наравне с оригиналом.
          const asFile = (c) => ({ url: c.url, fileName: c.fileName });
          extraction = {
            status: 'pending',
            ...recognized,
            sourceFile: asFile(candidate),
            duplicateFiles: firstInvoice.duplicates.map(asFile),
            recognizedAt: new Date().toISOString(),
            ...(restInvoices.length > 0 && {
              additionalInvoices: restInvoices.map((inv) => ({
                ...inv.recognized,
                sourceFile: asFile(inv.candidate),
                duplicateFiles: inv.duplicates.map(asFile),
                applied: null,
              })),
            }),
          };
          // Проверка благонадёжности для ВСЕ найденных счётов
          for (const invoice of result.allRecognized) {
            await saveReliabilityIfNew(invoice.recognized.supplierInn);
          }
        } else if (result.attempts.length > 0 || result.skipped.length > 0) {
          extraction = emptyExtraction({ attempts: result.attempts, skipped: result.skipped });
        }
      } catch (err) {
        console.error('Не удалось автораспознать вложение как счёт (не критично, письмо всё равно сохранится):', err);
        extraction = emptyExtraction({
          attempts: [],
          skipped: [],
          error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
        });
      }
    }

    const row = purchaseId
      ? await insertEmailRow('purchase_emails', {
          purchase_id: purchaseId,
          direction: 'in',
          from_address: fromAddress,
          to_address: toAddress || '',
          subject,
          body,
          files,
          resend_message_id: data.email_id ?? data.id ?? null,
        })
      : contractorId
      ? // Переписка с подрядчиком: без extraction — распознавание счетов
        // выше запускается только при offerId (это про поставщиков
        // материалов), подрядчику мы пишем и читаем руками.
        await insertEmailRow('work_contractor_emails', {
          contractor_id: contractorId,
          direction: 'in',
          from_address: fromAddress,
          to_address: toAddress || '',
          subject,
          body,
          files,
          resend_message_id: data.email_id ?? data.id ?? null,
        })
      : await insertEmailRow('supplier_offer_emails', {
          offer_id: offerId,
          order_id: orderId,
          direction: 'in',
          from_address: fromAddress,
          to_address: toAddress || '',
          subject,
          body,
          files,
          extraction,
          resend_message_id: data.email_id ?? data.id ?? null,
        });

    // Запись распознанных счётов в карточку поставщика/заявку — СРАЗУ, не
    // дожидаясь, пока закупщица откроет письмо и нажмёт "Подтвердить"
    // (владелец, 2026-09-12: "мне нужно автоматическое распознавание счетов
    // и запись в базу ещё до открытия письма нами вручную"). Делается уже
    // ПОСЛЕ вставки письма — строке КП нужен его id (source_email_id), да и
    // порядок такой безопаснее: если запись в карточку сорвётся, письмо со
    // своим распознаванием всё равно на месте и останется старый ручной
    // путь (extraction.status:'pending' — кнопка в переписке).
    //
    // 2026-09-14: обрабатываем ВСЕ найденные счёты, а не только первый.
    if (recognizedInvoicesData?.allRecognized && recognizedInvoicesData.allRecognized.length > 0 && row?.id) {
      const several = recognizedInvoicesData.allRecognized.length > 1;
      // Снимок записи по каждому счёту, разложенный по url вложения: в
      // extraction каждый счёт носит СВОЙ applied (первый — в корне,
      // остальные в additionalInvoices, см. data/supplierOfferEmails.ts).
      // Раньше при двух счетах в корневой applied клался МАССИВ снимков —
      // форма, которой фронт не знает: карточка счёта падала на
      // applied.itemIds, то есть ни сверить позиции, ни откатить запись
      // было нельзя.
      const appliedByUrl = new Map();
      for (const invoice of recognizedInvoicesData.allRecognized) {
        try {
          const invoiceSourceFile = { url: invoice.candidate.url, fileName: invoice.candidate.fileName };
          const applied = await applyRecognizedInvoice({
            emailId: row.id,
            offerId,
            orderId,
            subject,
            recognized: invoice.recognized,
            sourceFile: invoiceSourceFile,
            title: quoteTitle(subject, invoiceSourceFile.fileName, several),
          });
          appliedByUrl.set(invoiceSourceFile.url, applied);
        } catch (err) {
          console.error(`Не удалось записать счёт ${invoice.candidate.fileName} в карточку (письмо сохранено, останется ручное подтверждение):`, err);
        }
      }
      if (appliedByUrl.size > 0) {
        extraction = {
          ...extraction,
          // 'confirmed' только когда записаны ВСЕ счета письма: если один
          // из двух не записался, письмо остаётся с пометкой "есть что
          // подтвердить" — в переписке у такого счёта будет обычная
          // кнопка ручного подтверждения, а у записанных — своя карточка.
          status: appliedByUrl.size === recognizedInvoicesData.allRecognized.length ? 'confirmed' : 'pending',
          appliedAutomatically: true,
          applied: appliedByUrl.get(extraction.sourceFile?.url) ?? null,
          ...(extraction.additionalInvoices && {
            additionalInvoices: extraction.additionalInvoices.map((inv) => ({
              ...inv,
              applied: appliedByUrl.get(inv.sourceFile?.url) ?? null,
            })),
          }),
        };
        // Только supplier_offer_emails: распознавание запускается лишь при
        // offerId (см. выше), в переписке по закупкам счетов не разбираем.
        await updateEmailExtraction('supplier_offer_emails', row.id, extraction);
        row.extraction = extraction;
      }
    }

    if (offerId) {
      try {
        await autoFillOfferContact(offerId, parseFromHeader(fromAddress));
      } catch (err) {
        console.error('Не удалось автозаполнить email/имя менеджера у предложения (не критично):', err);
      }
    }

    res.status(200).json({ email: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось обработать письмо' });
  }
}
