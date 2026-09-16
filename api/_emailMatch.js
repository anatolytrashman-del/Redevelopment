// Разбор адреса получателя и заголовков входящего письма — чистые функции
// без сети и базы (шаг 9 плана закупок). Вынесены из
// purchase-email-webhook.js отдельным файлом ради тестов: сам вебхук
// протестировать нечем — он весь про подпись Svix, Resend и Supabase.
// Файл с подчёркиванием — это хелпер, а не эндпоинт: на Hobby-плане
// serverless-функций ровно 12 из 12 (см. CLAUDE.md).

// Наши закупочные ящики. MX стоит на весь домен, то есть Resend приносит
// сюда ЛЮБОЕ письмо на redevelopment.pro — включая спам на случайные
// адреса. В «разобрать вручную» (см. ниже) пускаем только письма,
// адресованные закупкам: и с plus-кодом, и без него. Всё остальное
// по-прежнему молча пропускаем, иначе очередь ручного разбора за неделю
// зарастёт рекламой.
export const PURCHASING_INBOX_RE = /(?:zakupki|research)(?:\+[^@\s>]*)?@/i;

export function isPurchasingInbox(toAddress) {
  return PURCHASING_INBOX_RE.test(String(toAddress || ''));
}

// Общий ящик компании — страница "Почта" в админке (владелец, 2026-09-16:
// "мне нужен общий блок с email-ящиком в интерфейсе... Ящик —
// a@redevelopment.pro"). В отличие от закупочных адресов, здесь нет
// plus-кода и нечего резолвить: любое письмо на этот адрес просто ложится
// в общую ленту mailbox_emails. Plus-адресация всё же принимается
// (a+что-угодно@) — почтовые клиенты и сервисы регистрации ей пользуются, и
// такое письмо тоже наше.
export const SHARED_MAILBOX_LOCAL = 'a';
export const SHARED_MAILBOX_ADDRESS = 'a@redevelopment.pro';

const SHARED_MAILBOX_RE = /(?:^|[\s<,:;"'])a(?:\+[^@\s>]*)?@redevelopment\.pro/i;

// toAddress приходит и строкой, и массивом (Resend отдаёт "to" массивом),
// и в виде заголовка «Имя <адрес>» — принимаем всё сразу: письмо на общий
// ящик в копии остаётся письмом на общий ящик.
export function isSharedMailbox(toAddress) {
  const list = Array.isArray(toAddress) ? toAddress : [toAddress];
  return list.some((value) => SHARED_MAILBOX_RE.test(` ${String(value || '')}`));
}

// Заголовки Resend отдаёт словарём (проверено на живом письме 2026-09-16:
// {"in-reply-to": "<...>", "references": "<...> <...>"}), но формат ответа
// у них уже менялся — читаем защитно и массив вида [{name, value}] тоже.
export function headerValue(headers, name) {
  if (!headers) return '';
  const target = name.toLowerCase();
  if (Array.isArray(headers)) {
    const found = headers.find((h) => String(h?.name || '').toLowerCase() === target);
    return String(found?.value ?? '');
  }
  if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === target) return String(value ?? '');
    }
  }
  return '';
}

// Message-ID писем, на которые отвечает это письмо, — самое надёжное из
// того, что вообще есть, когда plus-адрес потерялся.
//
// In-Reply-To идёт первым (это прямой родитель), затем References в
// обратном порядке (в конце списка — самое свежее письмо цепочки).
export function referencedMessageIds(headers) {
  const ids = [];
  const push = (raw) => {
    for (const m of String(raw || '').matchAll(/<[^>\s]+>/g)) {
      if (!ids.includes(m[0])) ids.push(m[0]);
    }
  };
  push(headerValue(headers, 'in-reply-to'));
  const refs = [...String(headerValue(headers, 'references') || '').matchAll(/<[^>\s]+>/g)].map((m) => m[0]).reverse();
  push(refs.join(' '));
  return ids;
}

