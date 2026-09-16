// Копилка Telegram: разбор апдейтов бота, которому владелец ПЕРЕСЫЛАЕТ важные
// сообщения и файлы из личных диалогов (юрист, сторител, блогеры). Сообщение
// падает в таблицу telegram_captures, файлы — в бакет object-documents, текст
// прогоняется через Haiku ради короткой выжимки и типа. Разбирает результат
// человек на вкладке "Telegram" страницы "Почта" — автозаписи в карточки нет
// намеренно (см. комментарий в миграции 20260916-telegram-captures.sql).
//
// Файл с "_" в начале — общий хелпер, а не отдельная serverless-функция:
// в api/ ровно 12 функций, что РОВНО потолок Vercel Hobby, тринадцатая
// уронила бы деплой целиком. Сам вебхук живёт веткой в telegram-avatar.js
// (единственный уже существующий файл про Telegram), а человекочитаемый
// адрес /api/telegram-webhook даёт rewrite в vercel.json.
//
// Что нужно в переменных окружения Vercel:
//   TELEGRAM_BOT_TOKEN        — токен бота от @BotFather
//   TELEGRAM_WEBHOOK_SECRET   — произвольная строка, ею же зарегистрирован
//                               вебхук (secret_token у setWebhook). Telegram
//                               присылает её в заголовке, без совпадения
//                               апдейт не разбирается: иначе любой, кто
//                               узнает URL, мог бы подкинуть в копилку что
//                               угодно от имени кого угодно.
//   TELEGRAM_ALLOWED_USER_IDS — id тех, кого бот слушает, через запятую.
//                               ПУСТО — бот никого не слушает, но на любое
//                               сообщение отвечает "ваш id такой-то": это и
//                               есть способ узнать свой id, не заводя ради
//                               него отдельный сервис.

import { timingSafeEqual } from 'node:crypto';
import { uploadAttachment } from './_attachments.js';
import { proxyApiKeyProblem } from './_proxyapi.js';
import { parseModelJson } from './_invoiceRecognition.js';

const TELEGRAM_API = 'https://api.telegram.org';
// Потолок самого Bot API на скачивание файла ботом — 20 МБ; просить больше
// бессмысленно, getFile на таком файле просто вернёт ошибку.
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MODEL = 'claude-haiku-4-5-20251001';
// Разговорная речь длинных простыней не даёт, а переслать могут и статью
// целиком — режем, чтобы один пересланный лонгрид не стоил как разбор счёта.
const TEXT_LIMIT = 6000;

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET);
}

// Сравнение именно timingSafeEqual, а не === : секрет проверяется на каждом
// запросе с чужой стороны, и посимвольное сравнение по времени ответа
// подсказывает, сколько первых символов угаданы.
export function secretMatches(headerValue) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const got = String(headerValue || '');
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function allowedUserIds() {
  return String(process.env.TELEGRAM_ALLOWED_USER_IDS || '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);
}

async function telegramCall(method, body) {
  const resp = await fetch(`${TELEGRAM_API}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.ok) {
    throw new Error(`Telegram ${method}: ${resp.status} ${JSON.stringify(data)?.slice(0, 300)}`);
  }
  return data.result;
}

// Ответ в чат — единственный признак для человека, что пересылка дошла.
// Никогда не бросает: сообщение уже сохранено, и падать на ответе (например,
// если бота заблокировали) значило бы отдать Telegram не-200 и получить
// повторную доставку того же самого.
async function replyQuietly(chatId, text, replyToMessageId) {
  try {
    await telegramCall('sendMessage', {
      chat_id: chatId,
      text,
      reply_to_message_id: replyToMessageId,
      allow_sending_without_reply: true,
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    console.error('[telegram-capture] не удалось ответить в чат:', err instanceof Error ? err.message : err);
  }
}

// Откуда переслано. Bot API 7.0+ отдаёт forward_origin, старые поля
// (forward_from/forward_sender_name) пока дублируются ради совместимости —
// читаем оба, начиная с нового.
function forwardInfo(message) {
  const origin = message.forward_origin;
  if (origin) {
    const date = Number.isFinite(origin.date) ? new Date(origin.date * 1000).toISOString() : null;
    if (origin.type === 'user') {
      const user = origin.sender_user || {};
      return {
        kind: 'forward',
        name: [user.first_name, user.last_name].filter(Boolean).join(' '),
        username: user.username || '',
        date,
      };
    }
    if (origin.type === 'hidden_user') {
      // У собеседника закрыта ссылка при пересылке: имя есть, id нет. Это
      // штатная ситуация, а не ошибка — подпись правится руками в интерфейсе.
      return { kind: 'forward', name: origin.sender_user_name || '', username: '', date };
    }
    if (origin.type === 'chat' || origin.type === 'channel') {
      const chat = origin.sender_chat || origin.chat || {};
      return { kind: 'forward', name: chat.title || '', username: chat.username || '', date };
    }
    return { kind: 'forward', name: '', username: '', date };
  }
  if (message.forward_from || message.forward_sender_name || message.forward_from_chat) {
    const user = message.forward_from || {};
    const chat = message.forward_from_chat || {};
    return {
      kind: 'forward',
      name:
        [user.first_name, user.last_name].filter(Boolean).join(' ') ||
        message.forward_sender_name ||
        chat.title ||
        '',
      username: user.username || chat.username || '',
      date: Number.isFinite(message.forward_date) ? new Date(message.forward_date * 1000).toISOString() : null,
    };
  }
  return { kind: 'direct', name: '', username: '', date: null };
}

// Вложение из сообщения. Фото приходит набором размеров — берём последний
// (самый крупный), у него нет ни имени, ни mime-типа, поэтому подставляем свои.
function attachmentSpec(message) {
  if (message.document) {
    return {
      fileId: message.document.file_id,
      fileName: message.document.file_name || 'document',
      contentType: message.document.mime_type || 'application/octet-stream',
      size: message.document.file_size || 0,
    };
  }
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1];
    return { fileId: largest.file_id, fileName: 'photo.jpg', contentType: 'image/jpeg', size: largest.file_size || 0 };
  }
  for (const [field, fallbackName, fallbackType] of [
    ['video', 'video.mp4', 'video/mp4'],
    ['audio', 'audio.mp3', 'audio/mpeg'],
    ['voice', 'voice.ogg', 'audio/ogg'],
    ['video_note', 'video-note.mp4', 'video/mp4'],
  ]) {
    const media = message[field];
    if (media) {
      return {
        fileId: media.file_id,
        fileName: media.file_name || fallbackName,
        contentType: media.mime_type || fallbackType,
        size: media.file_size || 0,
      };
    }
  }
  return null;
}

async function downloadAttachment(spec) {
  if (spec.size && spec.size > MAX_FILE_BYTES) {
    return { tooLarge: true };
  }
  const file = await telegramCall('getFile', { file_id: spec.fileId });
  const resp = await fetch(`${TELEGRAM_API}/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
  if (!resp.ok) throw new Error(`Скачивание файла: ${resp.status}`);
  const bytes = Buffer.from(await resp.arrayBuffer());
  if (bytes.byteLength > MAX_FILE_BYTES) return { tooLarge: true };
  const uploaded = await uploadAttachment(bytes, spec.contentType, spec.fileName);
  return {
    file: {
      fileName: uploaded.fileName,
      url: uploaded.url,
      contentType: spec.contentType,
      size: bytes.byteLength,
    },
  };
}

const SYSTEM_PROMPT = `Ты разбираешь сообщения, которые владелец компании
пересылает себе в рабочую копилку из личных диалогов в Telegram. Собеседники —
юрист, сценарист/сторител, блогеры-партнёры, изредка подрядчики. Компания
занимается редевелопментом коммерческой недвижимости: перестраивает здания под
аренду и продажу кабинетов и рабочих мест.

Верни СТРОГО JSON без пояснений и без markdown-разметки:
{
  "kind": "document" | "terms" | "deadline" | "contact" | "idea" | "chat",
  "summary": "одна строка, максимум 120 символов, по-русски",
  "facts": ["конкретный факт", "..."],
  "dueDate": "YYYY-MM-DD" | null,
  "counterparty": "имя человека или компании, о ком речь, либо пустая строка"
}

Что означает kind:
- document — прислан или обсуждается документ (договор, редакция, акт, счёт);
- terms — названы условия сделки: сумма, процент, объём работ, что входит;
- deadline — назван срок или дата, к которой что-то должно случиться;
- contact — контакт человека или компании, кого с кем свести;
- idea — идея, формулировка, кусок текста для сайта или рекламы;
- chat — согласование, "ок", "давай", благодарность, всё остальное.

Правила:
- facts — только то, что прямо сказано в сообщении. Ни одного факта,
  додуманного из общего знания о недвижимости. Нечего извлечь — пустой массив;
  это нормальный и частый ответ.
- dueDate заполняй, только если дата названа однозначно ("до 20 марта",
  "к пятнице" при известной дате сообщения). "Скоро", "на следующей неделе",
  "как получится" — null.
- summary пишет человек для себя через полгода: не "сообщение от юриста", а
  "юрист прислал правки к договору аренды, спорный п. 4.2".
- Текст может быть обрывочным, с опечатками и без контекста — это переписка,
  а не документ. Не выдумывай недостающее.`;

// Разбор моделью. Никогда не бросает: сообщение уже важнее разбора, и падать
// на недоступной модели значило бы потерять саму пересылку.
export async function classifyCapture({ text, fileNames, sourceName, messageDate }) {
  const clean = String(text ?? '').trim().slice(0, TEXT_LIMIT);
  if (!clean && fileNames.length === 0) return null;

  const keyProblem = proxyApiKeyProblem();
  if (keyProblem) {
    console.error('[telegram-capture] разбор пропущен:', keyProblem);
    return null;
  }

  const parts = [
    sourceName ? `Автор сообщения: ${sourceName}` : 'Автор сообщения неизвестен (пересылка без ссылки на отправителя)',
    messageDate ? `Дата сообщения: ${messageDate.slice(0, 10)}` : '',
    fileNames.length > 0 ? `Приложенные файлы: ${fileNames.join(', ')}` : 'Файлов нет',
    '',
    clean || '(текста нет, только файл)',
  ].filter(Boolean);

  try {
    const resp = await fetch('https://api.proxyapi.ru/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.PROXYAPI_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [{ type: 'text', text: parts.join('\n') }] }],
      }),
    });
    if (!resp.ok) {
      console.error('[telegram-capture] модель вернула', resp.status, (await resp.text()).slice(0, 300));
      return null;
    }
    const parsed = parseModelJson(await resp.json());
    const kinds = ['document', 'terms', 'deadline', 'contact', 'idea', 'chat'];
    const dueDate = typeof parsed?.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate) ? parsed.dueDate : null;
    return {
      kind: kinds.includes(parsed?.kind) ? parsed.kind : 'chat',
      summary: String(parsed?.summary ?? '').trim().slice(0, 200),
      facts: Array.isArray(parsed?.facts) ? parsed.facts.map((f) => String(f).trim()).filter(Boolean).slice(0, 10) : [],
      dueDate,
      counterparty: String(parsed?.counterparty ?? '').trim().slice(0, 120),
    };
  } catch (err) {
    console.error('[telegram-capture] разбор не удался:', err instanceof Error ? err.message : err);
    return null;
  }
}


// --- Автопривязка к карточке по нику -----------------------------------
// Владелец, 2026-09-16, увидев первую живую запись: «Не хочу выбирать контакт
// вручную, ты видишь ник и сам понимаешь, к какому диалогу привязать».
//
// Ник Telegram — единственный надёжный ключ: он уникален, а имя в профиле
// человек меняет как хочет («Дмитрий НиколаИч» в профиле против «Дмитрий
// Иванцов (Мир НиколаИча)» в карточке коллаборации — одно и то же лицо, но
// ни одна проверка по имени их не свяжет).
//
// БЛИЗНЕЦ: та же нормализация ника живёт на фронте в
// src/lib/telegramHandle.ts (extractTelegramHandle). Serverless-функции —
// голый JS и импортировать TypeScript из src/ не умеют. Правится одна
// сторона — правится и вторая, иначе ссылка в карточке лида будет вести
// туда, куда копилка не привязывает.
const TELEGRAM_HANDLE_RE = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

function normalizeHandle(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const handle = trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/^(t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '');
  // Ники в Telegram регистронезависимы: @Dmitry_Nikolai4 и @dmitry_nikolai4 —
  // один и тот же человек, а в карточке он записан как придётся.
  return TELEGRAM_HANDLE_RE.test(handle) ? handle.toLowerCase() : '';
}

async function restSelect(path) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) throw new Error(`Supabase GET ${path}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

// Возвращает { type, id } или null. Ищем только там, где Telegram-контакт
// заводится руками и список обозримый: коллаборации (блогеры, партнёры) и
// лиды. Поставщиков и подрядчиков сознательно не трогаем — их больше тысячи,
// ник там попадается редко, а ошибочная привязка счёта к чужой карточке
// дороже, чем пустое поле.
//
// Никогда не бросает: не нашли или база недоступна — запись просто ляжет без
// привязки, её проставят руками.
export async function resolveLink(username) {
  const handle = normalizeHandle(username);
  if (!handle) return null;
  try {
    const [collaborations, leads] = await Promise.all([
      restSelect('collaborations?select=id,contact,contact_method'),
      restSelect('leads?select=id,contact,contact_method'),
    ]);
    for (const [type, rows] of [
      ['collaboration', collaborations],
      ['lead', leads],
    ]) {
      const hit = rows.find((row) => normalizeHandle(row.contact) === handle);
      if (hit) return { type, id: hit.id };
    }
    return null;
  } catch (err) {
    console.error('[telegram-capture] автопривязка не удалась:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function insertCapture(row) {
  const resp = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/telegram_captures?on_conflict=chat_id,message_id`,
    {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        // ignore-duplicates — защита от повторной доставки апдейта: Telegram
        // шлёт его заново, пока не получит 200, а эта функция успевает и
        // скачать файл, и сходить в модель.
        Prefer: 'return=representation,resolution=ignore-duplicates',
      },
      body: JSON.stringify(row),
    },
  );
  if (!resp.ok) throw new Error(`Supabase POST telegram_captures: ${resp.status} ${await resp.text()}`);
  const rows = await resp.json();
  return rows[0] ?? null;
}

async function patchCapture(id, body) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/telegram_captures?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Supabase PATCH telegram_captures: ${resp.status} ${await resp.text()}`);
}

const KIND_LABELS = {
  document: 'документ',
  terms: 'условия',
  deadline: 'срок',
  contact: 'контакт',
  idea: 'идея',
  chat: 'разговор',
};

// Главный разбор апдейта. Возвращает короткую строку для лога Vercel —
// вызывающая функция в любом случае отвечает Telegram 200 (не-200 означает
// повторную доставку того же апдейта, а нам это нужно только при настоящем
// сбое записи).
export async function handleTelegramUpdate(update) {
  const message = update?.message ?? update?.edited_message ?? null;
  if (!message) return 'апдейт без message — пропущен';

  const chatId = message.chat?.id;
  const from = message.from || {};
  const senderName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || '';

  const allowed = allowedUserIds();
  if (allowed.length === 0) {
    // Способ узнать свой id, не заводя ради этого сторонних ботов: пока
    // список пуст, бот не пишет НИЧЕГО в базу, только называет id.
    await replyQuietly(
      chatId,
      `Бот-копилка ещё не настроен.\n\nВаш Telegram id: ${from.id}\n\nДобавьте его в переменную TELEGRAM_ALLOWED_USER_IDS на Vercel — и пересылайте сюда сообщения.`,
      message.message_id,
    );
    return `список разрешённых пуст, назван id ${from.id}`;
  }
  if (!allowed.includes(from.id)) {
    // Молча: посторонний не должен по ответу бота понять, что попал в
    // рабочий инструмент, а не в заброшенного бота.
    return `посторонний отправитель ${from.id} — проигнорирован`;
  }

  if (message.text && message.text.startsWith('/start')) {
    await replyQuietly(
      chatId,
      'Пересылайте сюда сообщения и файлы из любых диалогов — они попадут в копилку на вкладке «Telegram» в разделе «Почта».',
      message.message_id,
    );
    return 'команда /start';
  }

  const forward = forwardInfo(message);
  const text = message.text ?? message.caption ?? '';

  const spec = attachmentSpec(message);
  const files = [];
  let fileNote = '';
  if (spec) {
    try {
      const result = await downloadAttachment(spec);
      if (result.tooLarge) {
        fileNote = `\n\nФайл «${spec.fileName}» не сохранён: больше 20 МБ, столько бот скачать не может. Пришлите ссылкой.`;
      } else if (result.file) {
        files.push(result.file);
      }
    } catch (err) {
      console.error('[telegram-capture] файл не сохранён:', err instanceof Error ? err.message : err);
      fileNote = `\n\nФайл «${spec.fileName}» не сохранился — посмотрите логи.`;
    }
  }

  // Привязка ищется ДО вставки: это один короткий запрос в базу, и без неё
  // запись показалась бы владельцу непривязанной ровно до следующего
  // обновления страницы.
  const link = await resolveLink(forward.username);

  // Сначала запись, потом модель: если функцию убьют по времени на разборе,
  // сама пересылка уже в базе, а повторную доставку погасит уникальный индекс.
  const created = await insertCapture({
    chat_id: chatId,
    message_id: message.message_id,
    sender_user_id: from.id ?? null,
    sender_name: senderName,
    source_kind: forward.kind,
    source_name: forward.name,
    source_username: forward.username,
    source_date: forward.date,
    text,
    files,
    linked_type: link ? link.type : '',
    linked_id: link ? link.id : null,
  });
  if (!created) return 'повторная доставка того же сообщения — пропущена';

  const classified = await classifyCapture({
    text,
    fileNames: files.map((f) => f.fileName),
    sourceName: forward.name,
    messageDate: forward.date || new Date(message.date * 1000).toISOString(),
  });
  if (classified) {
    await patchCapture(created.id, {
      kind: classified.kind,
      summary: classified.summary,
      facts: classified.facts,
      due_date: classified.dueDate,
      counterparty: classified.counterparty,
    });
  }

  const lines = ['Записал в копилку.'];
  if (classified?.summary) lines.push(`\n${classified.summary}`);
  if (classified?.kind) lines.push(`Тип: ${KIND_LABELS[classified.kind] ?? classified.kind}`);
  if (classified?.dueDate) lines.push(`Срок: ${classified.dueDate}`);
  if (files.length > 0) lines.push(`Файл: ${files[0].fileName}`);
  await replyQuietly(chatId, lines.join('\n') + fileNote, message.message_id);

  return `сохранено ${created.id}`;
}
