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

