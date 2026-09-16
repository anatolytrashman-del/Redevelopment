// События Resend по ОТПРАВЛЕННЫМ письмам (шаг 9 плана закупок,
// docs/procurement-product-steps.md). Вызывается из
// purchase-email-webhook.js — отдельной serverless-функции не заводим, на
// Hobby-плане их ровно 12 из 12 (см. CLAUDE.md), да и подписан в Resend
// один-единственный endpoint на все типы событий сразу.
//
// Что тут важно понимать. Вебхук был подписан на весь список типов ещё при
// создании (2026-08-29), но читались из него только входящие письма:
// у email.delivered/opened/bounced/complained получатель ("to") — это адрес
// поставщика, plus-код оттуда не извлекается, и функция отвечала
// {skipped:true}. Ответ почтового сервера «такого ящика не существует» мы
// получали и выбрасывали: письмо в переписке выглядело отправленным,
// поставщик числился молчащим, а дожим (шаг 8) исправно слал ему
// напоминания в несуществующий ящик.
//
// Матчинг события с нашей записью — по resend_message_id (id письма в
// Resend, который отправка кладёт в строку переписки). Письмо может лежать
// в любой из трёх таблиц переписки, поэтому ищем по очереди; а ещё через
// Resend уходят письма, которых у нас в переписке нет вовсе (коды
// подписания соглашений, api/agreement-otp-request.js) — для них ни одна
// таблица не совпадёт, и это норма, а не ошибка.

const EMAIL_TABLES = ['supplier_offer_emails', 'purchase_emails', 'work_contractor_emails'];

// Типы событий, которые мы действительно обрабатываем. email.sent не меняет
// ничего в строке письма, но нужен ради заголовка Message-ID (см.
// fetchMessageIdHeader) — он приходит первым, задолго до ответа поставщика.
// Остальные (email.clicked, email.delivery_delayed, domain.*, contact.*)
// приходят, но ничего не меняют — молча подтверждаем приём.
const HANDLED = new Set(['email.sent', 'email.delivered', 'email.opened', 'email.bounced', 'email.complained']);

export function isOutgoingEmailEvent(type) {
  return typeof type === 'string' && type !== 'email.received' && type.startsWith('email.');
}

function authHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

async function patchRows(table, query, patch) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) {
    console.error(`Не удалось обновить ${table} по событию Resend:`, await resp.text());
    return [];
  }
  return await resp.json();
}

// Адрес получателя события. Resend отдаёт "to" массивом, но у наших писем
// получатель всегда один (и рассылка, и ответы шлются по одному адресу).
function eventAddress(data) {
  const to = Array.isArray(data?.to) ? data.to[0] : data?.to;
  return String(to || '').trim().toLowerCase();
}

// Письмо вернулось навсегда — адрес мёртвый. Отметка живёт на карточке
// категории (оттуда рассылка и дожим берут email) и дублируется на контакте
// компании, чтобы тот же адрес не переехал в новую категорию руками.
//
// ТОЛЬКО постоянные отказы (type=Permanent: ящика не существует, домен не
// принимает почту). Transient — «ящик переполнен», «сервер занят»: адрес
// живой, письмо стоит повторить, снимать поставщика с рассылки из-за этого
// нельзя.
async function markAddressInvalid(address, reason) {
  if (!address) return { offers: 0, contacts: 0 };
  const at = new Date().toISOString();
  const patch = { email_invalid_at: at, email_invalid_reason: reason ? String(reason).slice(0, 300) : null };
  // ilike, не eq: адрес в карточке заведён руками и регистр гуляет
  // («Zakaz@...» в одной, «zakaz@...» в другой). Экранировать шаблон не
  // нужно — % и _ в адресе электронной почты не встречаются.
  const offers = await patchRows(
    'supplier_research_offers',
    `email=ilike.${encodeURIComponent(address)}&email_invalid_at=is.null&select=id`,
    patch,
  );
  const contacts = await patchRows(
    'supplier_contacts',
    `email=ilike.${encodeURIComponent(address)}&email_invalid_at=is.null&select=id`,
    { email_invalid_at: at },
  );
  return { offers: offers.length, contacts: contacts.length };
}

// Жалоба на спам — это прямой запрет писать этой компании дальше. Ставим её
// в стоп-лист (шаг 4b, suppliers.blocked_reason): рассылка и дожим
// заблокированных пропускают. Уже заблокированную компанию не трогаем —
// причина, написанная человеком, важнее автоматической.
async function blockSupplierByAddress(address) {
  if (!address) return 0;
  const resp = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/supplier_research_offers?email=ilike.${encodeURIComponent(address)}&supplier_id=not.is.null&select=supplier_id`,
    { headers: authHeaders() },
  );
  if (!resp.ok) return 0;
  const ids = [...new Set((await resp.json()).map((r) => r.supplier_id).filter(Boolean))];
  if (ids.length === 0) return 0;
  const blocked = await patchRows(
    'suppliers',
    `id=in.(${ids.join(',')})&blocked_reason=is.null&select=id`,
    {
      blocked_reason: `Пожаловался на спам (${new Date().toLocaleDateString('ru-RU')}, адрес ${address})`,
      blocked_at: new Date().toISOString(),
    },
  );
  return blocked.length;
}

// Настоящий заголовок Message-ID нашего письма.
//
// Проверено на живой переписке 2026-09-16: resend_message_id (uuid из
// ответа POST /emails) и заголовок Message-ID, который видит поставщик, —
// РАЗНЫЕ вещи. Resend отправляет через Amazon SES, и в письмо уходит
// «<010201a09f7ca7fa-…-000000@eu-west-1.amazonses.com>»; именно этот
// заголовок почтовый клиент поставщика возвращает в In-Reply-To/References
// своего ответа. Поэтому сопоставить ответ с нашим письмом по
// resend_message_id невозможно в принципе — нужен этот заголовок, а отдаёт
// его только GET /emails/{id}.
//
// Забираем его при первом же событии по письму (обычно email.sent, через
// секунды после отправки) и больше не трогаем. Сбой здесь не критичен:
// матчинг по заголовкам просто не сработает, останутся plus-адрес и история
// адресов.
async function fetchMessageIdHeader(messageId) {
  if (!process.env.RESEND_API_KEY) return null;
  try {
    const resp = await fetch(`https://api.resend.com/emails/${encodeURIComponent(messageId)}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const header = json?.message_id ?? json?.data?.message_id ?? null;
    return typeof header === 'string' && header.trim() ? header.trim() : null;
  } catch (err) {
    console.error('Не удалось получить заголовок Message-ID письма:', err);
    return null;
  }
}

// Ищет наше письмо по resend_message_id во всех трёх таблицах переписки.
// Через Resend уходят и письма, которых у нас в переписке нет вовсе (коды
// подписания соглашений, api/agreement-otp-request.js) — ни одна таблица не
// совпадёт, и это норма.
async function findEmailRow(messageId) {
  for (const table of EMAIL_TABLES) {
    const resp = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/${table}?resend_message_id=eq.${encodeURIComponent(messageId)}&select=id,message_id_header,delivered_at,opened_at,bounced_at,complained_at&limit=1`,
      { headers: authHeaders() },
    );
    if (!resp.ok) continue;
    const rows = await resp.json();
    if (rows.length > 0) return { table, row: rows[0] };
  }
  return null;
}

// Возвращает короткий итог для лога/ответа вебхука. Ни одна ветка не
// бросает: событие о доставке не должно приводить к 500 и бесконечным
// ретраям Resend — письмо у нас уже есть, потеря отметки не фатальна.
export async function handleOutgoingEmailEvent(type, data) {
  if (!HANDLED.has(type)) return { event: type, ignored: true };

  const messageId = data?.email_id ?? data?.id ?? null;
  if (!messageId) return { event: type, ignored: true, reason: 'нет email_id' };

  const now = new Date().toISOString();
  const address = eventAddress(data);

  const found = await findEmailRow(messageId);
  const result = { event: type, messageId, table: found?.table ?? null, updated: 0 };

  if (found) {
    const { table, row } = found;
    const patch = {};
    // Заголовок Message-ID — один раз на письмо, при первом событии.
    if (!row.message_id_header) {
      const header = await fetchMessageIdHeader(messageId);
      if (header) patch.message_id_header = header;
    }

    let bounceReason = null;
    // Повторное событие того же типа ничего не переписывает: интересно,
    // когда письмо доставили/прочли ВПЕРВЫЕ, а не когда поставщик последний
    // раз пролистал тред.
    if (type === 'email.delivered' && !row.delivered_at) {
      patch.delivered_at = now;
    } else if (type === 'email.opened' && !row.opened_at) {
      patch.opened_at = now;
    } else if (type === 'email.bounced' && !row.bounced_at) {
      bounceReason = [data?.bounce?.type, data?.bounce?.subType, data?.bounce?.message].filter(Boolean).join(' · ');
      patch.bounced_at = now;
      patch.bounce_reason = bounceReason || 'Письмо не доставлено';
      // Тот же send_status, которым помечается сорвавшаяся отправка, — им
      // уже пользуются и интерфейс переписки, и дожим (воркер
      // process-followups не считает failed-письмо отправленным, то есть
      // не будет напоминать в мёртвый ящик).
      patch.send_status = 'failed';
      patch.send_error = `Не доставлено: ${bounceReason || 'почтовый сервер отклонил письмо'}`.slice(0, 500);
    } else if (type === 'email.complained' && !row.complained_at) {
      patch.complained_at = now;
    }

    if (Object.keys(patch).length > 0) {
      const updated = await patchRows(table, `id=eq.${row.id}&select=id`, patch);
      result.updated = updated.length;
    }
  }

  // Последствия за пределами строки письма — считаются и тогда, когда самого
  // письма у нас нет (адрес всё равно мёртвый, жалоба всё равно жалоба).
  if (type === 'email.bounced' && data?.bounce?.type === 'Permanent') {
    const reason = [data?.bounce?.subType, data?.bounce?.message].filter(Boolean).join(' · ');
    try {
      result.invalidated = await markAddressInvalid(address, reason);
    } catch (err) {
      console.error('Не удалось отметить адрес как недоставляемый:', err);
    }
  }
  if (type === 'email.complained') {
    try {
      result.blockedSuppliers = await blockSupplierByAddress(address);
    } catch (err) {
      console.error('Не удалось поставить компанию в стоп-лист по жалобе:', err);
    }
  }

  return result;
}
