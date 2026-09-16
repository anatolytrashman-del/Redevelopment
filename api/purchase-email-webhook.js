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
// проверяется до разбора payload. Без секрета в окружении функция отвечает
// 500 и НЕ обрабатывает письмо (раньше проверка в этом случае пропускалась —
// см. подробный разбор в самом обработчике).
//
// ВАЖНО (проверено 2026-09-03 по документации Resend, см. подробный
// комментарий в _attachments.js): сам вебхук email.received несёт только
// метаданные письма (from/to/subject/email_id/attachments-список без
// содержимого) — тела ("text"/"html") в нём НЕТ, его нужно дотягивать
// отдельным GET-запросом к api.resend.com (fetchReceivedEmail ниже).
// Раньше здесь ошибочно читалось data.text/data.html прямо из вебхука —
// на первом же реальном письме body сохранился бы пустой строкой.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { extractEmailAttachments, fetchReceivedEmail } from './_attachments.js';
import { isOutgoingEmailEvent, handleOutgoingEmailEvent } from './_emailEvents.js';
import { isPurchasingInbox, referencedMessageIds } from './_emailMatch.js';
import { MIN_TEXT_LENGTH, recognizeAllInvoicesFromAttachments, recognizeInvoiceFromText } from './_invoiceRecognition.js';
import { stripQuotedReply } from './_emailText.js';
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

// Второй способ привязки: ответ ссылается на наше письмо заголовком
// Message-ID. Сам заголовок лежит в message_id_header — он НЕ равен
// resend_message_id (uuid из ответа Resend на отправку), см. подробный
// разбор в api/_emailEvents.js; заполняется он при первом событии по
// письму, поэтому у писем, отправленных до 2026-09-16, его может не быть —
// для них остаётся третий способ, по адресу отправителя.
async function resolveByMessageIdHeaders(messageIds) {
  const authHeaders = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const targets = [
    { table: 'supplier_offer_emails', select: 'offer_id,order_id' },
    { table: 'purchase_emails', select: 'purchase_id' },
    { table: 'work_contractor_emails', select: 'contractor_id' },
  ];
  for (const messageId of messageIds.slice(0, 10)) {
    for (const { table, select } of targets) {
      try {
        const resp = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/${table}?message_id_header=eq.${encodeURIComponent(messageId)}&select=${select}&limit=1`,
          { headers: authHeaders },
        );
        if (!resp.ok) continue;
        const rows = await resp.json();
        if (rows.length === 0) continue;
        return {
          offerId: rows[0].offer_id ?? null,
          orderId: rows[0].order_id ?? null,
          purchaseId: rows[0].purchase_id ?? null,
          contractorId: rows[0].contractor_id ?? null,
        };
      } catch (err) {
        console.error('Ошибка поиска письма по Message-ID:', err);
      }
    }
  }
  return null;
}

// Третий способ: тот же адрес уже встречался в переписке. Работает ТОЛЬКО
// когда ответ однозначен — если с этим адресом связана не одна карточка, а
// несколько (поставщик продаёт и плинтусы, и керамогранит, у каждой
// категории своя карточка), угадывать нельзя: письмо со счётом уехало бы в
// чужую категорию, а распознавание записало бы оттуда цены. В таком случае
// возвращаем всех кандидатов, а решает человек.
async function offerCandidatesByFromAddress(fromAddress) {
  const address = String(fromAddress || '').trim().toLowerCase();
  if (!address || !address.includes('@')) return [];
  const authHeaders = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const ids = new Set();
  const queries = [
    `supplier_offer_emails?direction=eq.out&to_address=ilike.${encodeURIComponent(address)}&select=offer_id&order=created_at.desc&limit=100`,
    `supplier_research_offers?email=ilike.${encodeURIComponent(address)}&deleted_at=is.null&select=id&limit=100`,
  ];
  for (const query of queries) {
    try {
      const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${query}`, { headers: authHeaders });
      if (!resp.ok) continue;
      for (const row of await resp.json()) {
        const id = row.offer_id ?? row.id;
        if (id) ids.add(id);
      }
    } catch (err) {
      console.error('Ошибка поиска карточки по адресу отправителя:', err);
    }
  }
  return [...ids];
}

// Письмо, которое не удалось привязать ни одним способом. Сохраняем сразу и
// целиком (тело + перезалитые вложения): download_url у вложений Resend
// живёт час, «разберём завтра» означало бы письмо без файлов. Повторную
// доставку отсекает уникальный индекс по resend_message_id — конфликт тут
// не ошибка.
async function storeUnmatchedEmail(payload) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/unmatched_incoming_emails`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=ignore-duplicates',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    throw new Error(`Не удалось сохранить неразобранное письмо: ${await resp.text()}`);
  }
  const rows = await resp.json();
  return rows[0] ?? null;
}

async function unmatchedAlreadyStored(messageId) {
  if (!messageId) return false;
  try {
    const resp = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/unmatched_incoming_emails?select=id&resend_message_id=eq.${encodeURIComponent(messageId)}&limit=1`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!resp.ok) return false;
    return (await resp.json()).length > 0;
  } catch {
    return false;
  }
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

// Условия из письма → карточка поставщика. Сливаем, а не заменяем:
// в одном письме менеджер назвал срок, в другом — доставку, и второе письмо
// не должно стирать первое. Новое непустое значение перекрывает старое —
// поставщик поменял условия, и последнее слово за ним.
//
// 2026-09-16 (шаг 10): функция принимает уже готовые условия, а не текст
// письма. Раньше она сама звала модель отдельным дешёвым промптом «достань
// условия» — теперь условия приезжают тем же ЕДИНСТВЕННЫМ вызовом, что и
// цены из тела письма (recognizeInvoiceFromText), второй вызов на то же
// письмо был бы деньгами на пустом месте.
async function mergeOfferTerms(offerId, fresh) {
  if (!fresh) return;

  const authHeaders = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const resp = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/supplier_research_offers?id=eq.${offerId}&select=terms`,
    { headers: authHeaders },
  );
  if (!resp.ok) return;
  const rows = await resp.json();
  const current = rows?.[0]?.terms ?? null;

  const merged = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(fresh)) {
    if (value === null || value === '') continue;
    merged[key] = value;
  }

  await fetch(`${process.env.SUPABASE_URL}/rest/v1/supplier_research_offers?id=eq.${offerId}`, {
    method: 'PATCH',
    headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ terms: merged }),
  });
}

// Разбор ТЕЛА письма: цены (шаг 10) и условия поставки (шаг 6b) одним
// вызовом модели. Возвращает новое extraction письма, если в теле нашлись
// цены, и null во всех остальных случаях (условия при этом всё равно
// сливаются в карточку — они полезны и без цен).
//
// Порядок здесь не случаен:
//  1. Режем процитированную переписку (stripQuotedReply). Без этого модель
//     читает НАШ же запрос с ведомостью как предложение поставщика — в
//     ответе поставщика наше письмо лежит целиком, а в переторжке ещё и с
//     ценами. Это главная ловушка всего шага.
//  2. Один вызов на письмо. Промпт один и тот же и возвращает и позиции, и
//     terms — отдельный вызов «а теперь достань условия» был бы деньгами на
//     пустом месте.
//  3. Записываем ВСЕГДА, без порога уверенности. Владелец, 2026-09-16: «я
//     не буду открывать письма руками и не увижу твоё предложение о
//     распознавании счёта из текста — записывай по умолчанию». Порог,
//     который оставлял бы неуверенное распознавание ждать человека в
//     переписке, в этом режиме работы означает просто потерянные данные:
//     карточку «Похоже, это счёт» никто не откроет. Уверенность никуда не
//     делась — она едет вместе с позициями (recognitionConfidence в
//     PurchaseItem) и помечает ячейку «проверить» в сравнении цен, то есть
//     ровно там, где на цифры и смотрят.
async function recognizeFromEmailBody({ emailId, offerId, orderId, subject, body }) {
  const { text, cut } = stripQuotedReply(body);
  if (text.length < MIN_TEXT_LENGTH) {
    console.log(`[webhook] тело письма ${emailId}: после снятия цитаты осталось ${text.length} символов — модель не зовём`);
    return null;
  }

  const recognized = await recognizeInvoiceFromText(text, { subject });
  if (!recognized) return null;
  console.log(
    `[webhook] тело письма ${emailId}: цитата — ${cut ?? 'не найдена'}, isInvoice=${recognized.isInvoice}, уверенность=${recognized.confidence ?? 'нет'}, позиций=${recognized.items.length}`,
  );

  if (!recognized.isInvoice) {
    await mergeOfferTerms(offerId, recognized.terms);
    return null;
  }

  const extraction = {
    ...recognized,
    // Счёт из текста письма: файла-источника нет вовсе. Интерфейс это уже
    // умеет — карточка без sourceFile показывает кнопки подтверждения
    // вместо «посмотреть файл» (SupplierCorrespondenceTab). 'pending' здесь
    // — состояние на случай, если запись в карточку сорвётся: тогда остаётся
    // ручной путь. При обычном ходе дела статус ниже становится 'confirmed'.
    sourceFile: null,
    sourceKind: 'email_body',
    recognizedAt: new Date().toISOString(),
    status: 'pending',
  };

  try {
    const applied = await applyRecognizedInvoice({
      emailId,
      offerId,
      orderId,
      subject,
      recognized,
      sourceFile: null,
      // «— цены из письма» в заголовке КП: в сравнении цен строка, набранная
      // менеджером в теле письма, и строка из присланного счёта выглядели бы
      // одинаково, а доверие к ним разное.
      title: `${quoteTitle(subject, null, false)} — цены из письма`,
    });
    return { ...extraction, status: 'confirmed', appliedAutomatically: true, applied };
  } catch (err) {
    console.error('Не удалось записать цены из тела письма в карточку (останется ручное подтверждение):', err);
    await mergeOfferTerms(offerId, recognized.terms);
    return extraction;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawBody = await readRawBody(req);
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Раньше здесь была мягкая ветка: нет секрета — обрабатываем письмо без
    // проверки подписи, только с предупреждением в лог. Это оставляло
    // эндпоинт открытым для любого, кто узнает URL: поддельное "письмо от
    // поставщика" с любым отправителем, текстом и вложением-счётом попадало
    // бы прямо в переписку закупки, а автораспознавание счетов записало бы
    // из него цены в сравнение. Послабление было нужно ровно на время, пока
    // секрет не добавили в Vercel; он добавлен, поэтому теперь отсутствие
    // секрета — отказ обслуживать, а не тихий пропуск проверки.
    console.error('RESEND_WEBHOOK_SECRET не настроен — входящее письмо не принято');
    res.status(500).json({ error: 'Webhook secret is not configured' });
    return;
  }
  if (!verifyResendSignature(rawBody, req.headers, secret)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  try {
    const payload = JSON.parse(rawBody || '{}');
    // Resend оборачивает событие в { type, data } — data содержит сами
    // поля письма (to/from/subject/text). Поддерживаем и "плоский" вид на
    // случай отличающегося формата.
    const data = payload.data ?? payload;
    // Раньше здесь в лог уходил ВЕСЬ payload письма (до 3000 символов) —
    // отладка истории 2026-09-03 с пустым телом. Логи Vercel видны всем, у
    // кого есть доступ к проекту, и переписка поставщиков (адреса, условия,
    // цены) в них попадать не должна, а на Hobby-плане они живут час и для
    // разбора того инцидента всё равно не годятся. Оставляем только то, по
    // чему письмо можно найти в Resend и в нашей базе.
    console.log(
      '[webhook] входящее письмо:',
      JSON.stringify({
        type: payload.type ?? null,
        emailId: data.email_id ?? data.id ?? null,
        subject: (data.subject ?? '').slice(0, 120),
        attachments: Array.isArray(data.attachments) ? data.attachments.length : 0,
      }),
    );

    // События по УЖЕ ОТПРАВЛЕННЫМ письмам (доставлено / открыто / отлуп /
    // жалоба на спам). Этот endpoint подписан в Resend на весь список типов
    // ещё с 2026-08-29, но до шага 9 плана закупок читались только входящие:
    // у таких событий в "to" стоит адрес поставщика, plus-код оттуда не
    // извлекается — и ответ почтового сервера «такого ящика нет» уходил в
    // {skipped:true}. Разбор — в api/_emailEvents.js.
    if (isOutgoingEmailEvent(payload.type)) {
      const outcome = await handleOutgoingEmailEvent(payload.type, data);
      console.log('[webhook] событие по отправленному письму:', JSON.stringify(outcome));
      res.status(200).json(outcome);
      return;
    }

    const toRaw = data.to;
    const toAddress = Array.isArray(toRaw) ? toRaw[0] : toRaw;
    const fromAddress = data.from ?? '';
    const subject = data.subject ?? '';

    const code = extractShortCode(toAddress);
    const messageId = data.email_id ?? data.id ?? null;

    if (!code && !isPurchasingInbox(toAddress)) {
      // Письмо вообще не на закупочный ящик (MX стоит на весь домен, сюда
      // приносит любое письмо на redevelopment.pro) — не наша забота, но и
      // не ошибка самого вебхука: Resend не должен ретраить бесконечно.
      // Заодно не тратим запрос к Resend API на тело письма, которое всё
      // равно никуда не сохраним.
      res.status(200).json({ skipped: true });
      return;
    }

    // Тело и заголовки письма — одним запросом к Resend, лениво: при
    // обычном письме с plus-кодом они нужны уже после сопоставления, а при
    // письме без кода заголовки нужны, наоборот, для самого сопоставления.
    let received = null;
    const ensureReceived = async () => {
      if (!received) received = await fetchReceivedEmail([data.email_id, data.id]);
      return received;
    };

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
    let purchaseId = code ? await resolveIdByShortCode('purchases', code) : null;
    const matchedOffer = !code || purchaseId ? null : await resolveIdByShortCode('supplier_research_offers', code);
    const matchedOrder = !code || purchaseId || matchedOffer ? null : await resolveOrderByShortCode(code);
    let offerId = matchedOffer ?? matchedOrder?.offerId ?? null;
    let orderId = matchedOrder?.id ?? null;
    // Четвёртая таблица — подрядчики (вкладка "Подрядчики" страницы
    // "Закупки", владелец 2026-09-14). Проверяется последней из прямых
    // поисков: у поставщиков переписки на порядки больше, незачем на каждом
    // письме ходить сюда первым.
    let contractorId =
      !code || purchaseId || offerId ? null : await resolveIdByShortCode('work_contractors', code);

    // Фолбэк по истории отправленных писем (см. комментарий у
    // resolveOfferIdByEmailHistory) — только когда прямой поиск по всем
    // четырём таблицам ничего не дал.
    if (code && !purchaseId && !offerId && !contractorId) {
      offerId = await resolveOfferIdByEmailHistory(code);
    }

    // Шаг 9 плана закупок: письмо пришло на закупочный ящик, но по адресу
    // не привязалось — либо поставщик ответил на голый zakupki@ (его
    // почтовик подставил адрес из подписи, а не из Reply-To), либо код в
    // адресе ни во что не резолвится (например, закупку давно удалили).
    // Раньше такое письмо молча исчезало. Теперь у него ещё два пути, а
    // если не сработал ни один — своя очередь ручного разбора.
    let matchedBy = code && (purchaseId || offerId || contractorId) ? 'plus-адрес' : null;
    if (!purchaseId && !offerId && !contractorId) {
      if (await unmatchedAlreadyStored(messageId)) {
        console.warn('Повторная доставка неразобранного письма, пропускаем:', messageId);
        res.status(200).json({ skipped: true, duplicate: true });
        return;
      }

      const { headers } = await ensureReceived();
      const byHeader = await resolveByMessageIdHeaders(referencedMessageIds(headers));
      if (byHeader) {
        purchaseId = byHeader.purchaseId;
        offerId = byHeader.offerId;
        orderId = byHeader.orderId;
        contractorId = byHeader.contractorId;
        matchedBy = 'заголовок In-Reply-To';
      }

      if (!purchaseId && !offerId && !contractorId) {
        const candidates = await offerCandidatesByFromAddress(parseFromHeader(fromAddress).address);
        if (candidates.length === 1) {
          offerId = candidates[0];
          matchedBy = 'адрес отправителя';
        } else {
          const { body: unmatchedBody } = await ensureReceived();
          const unmatchedFiles = (await extractEmailAttachments(data)).map(({ url, fileName }) => ({ url, fileName }));
          const stored = await storeUnmatchedEmail({
            resend_message_id: messageId,
            from_address: fromAddress,
            to_address: toAddress || '',
            subject,
            body: unmatchedBody,
            files: unmatchedFiles,
            headers: headers ?? null,
            candidate_offer_ids: candidates,
          });
          console.warn(
            '[webhook] письмо не привязано ни к одной карточке, отправлено в ручной разбор:',
            JSON.stringify({ messageId, candidates: candidates.length }),
          );
          res.status(200).json({ unmatched: true, id: stored?.id ?? null, candidates: candidates.length });
          return;
        }
      }
    }
    console.log('[webhook] письмо привязано по:', matchedBy);

    // Повторная доставка того же письма (см. emailAlreadyStored) — отвечаем
    // 200 и ничего не делаем: письмо уже сохранено первым разом.
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

    // Тело письма — отдельным запросом, см. комментарий в начале файла
    // (у писем без plus-кода оно уже получено выше, при сопоставлении).
    const { body } = await ensureReceived();
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

      // Цены и условия из ТЕЛА письма, когда счёта во вложениях не нашлось
      // (шаг 6b — условия, шаг 10 — цены). Когда счёт распознан, и то и
      // другое уже вытащено вместе с ним и лежит на КП — повторно платить
      // модели незачем. А вот «плитка Alma 1 200 ₽/м², есть на складе,
      // отгрузим за 5 дней» без единого вложения раньше не оставалось нигде,
      // кроме глаз закупщика.
      const invoiceRecognized = (recognizedInvoicesData?.allRecognized?.length ?? 0) > 0;
      if (!invoiceRecognized && row?.id) {
        try {
          const bodyExtraction = await recognizeFromEmailBody({
            emailId: row.id,
            offerId,
            orderId,
            subject,
            body: row?.body ?? '',
          });
          if (bodyExtraction) {
            await updateEmailExtraction('supplier_offer_emails', row.id, bodyExtraction);
            row.extraction = bodyExtraction;
          }
        } catch (err) {
          console.error('Не удалось разобрать тело письма (не критично):', err instanceof Error ? err.message : err);
        }
      }
    }

    res.status(200).json({ email: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось обработать письмо' });
  }
}
