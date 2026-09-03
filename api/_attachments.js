// Общий хелпер для api/*.js: дотягивает тело и вложения входящего письма
// Resend Inbound и заливает вложения в бакет object-documents (тот же
// публичный бакет, что уже используется для счетов/КП в сметах — не заводим
// отдельный ради одного нового источника файлов). Используется
// purchase-email-webhook.js для обоих направлений переписки (закупки и
// Ресерч поставщиков) — единая логика, не дублировать.
//
// ВАЖНО, проверено 2026-09-03 через документацию Resend (сама песочница не
// достаёт resend.com напрямую, только через поиск) — вебхук email.received
// содержит ТОЛЬКО метаданные (email_id/from/to/subject/attachments-список
// без содержимого), НИ тела письма, НИ ссылок на файлы вложений в нём нет:
//   "Webhooks do not include the email body, headers, or attachments, only
//   their metadata. You must call the Received emails API or the
//   Attachments API to retrieve them."
// Поэтому оба хелпера ниже делают дополнительный GET-запрос к api.resend.com
// с RESEND_API_KEY (тот же ключ, что уже используется для отправки в
// purchase-send-email.js — новый секрет не нужен):
//   GET /emails/receiving/{emailId}              → { text, html, headers, ... }
//   GET /emails/receiving/{emailId}/attachments   → [{ id, filename,
//                                                       content_type,
//                                                       download_url (1ч),
//                                                       ... }]
// Раньше (до этой правки) код ошибочно ждал text/html и вложения прямо в
// самом теле вебхука — при первом реальном письме тело сохранялось бы
// пустой строкой. Реальный REST-ответ Resend не оборачивает ресурс в
// {data:...} (в отличие от JS SDK) — сверено с тем, как уже читается ответ
// отправки в purchase-send-email.js (`resendJson?.id`, не `resendJson.data.id`).
// Само по себе поле "attachments" в payload вебхука по-прежнему разбирается
// защитно (несколько вероятных названий полей), но за download_url теперь
// всегда идём отдельным запросом, а не ищем его в вебхуке.

import { randomUUID } from 'node:crypto';

const ATTACHMENTS_BUCKET = 'object-documents';
const RESEND_API_BASE = 'https://api.resend.com';

// 2026-09-03, живой прогон: реальное письмо сохранилось с ПУСТЫМ телом и
// без вложений, несмотря на этот фикс (см. журнал CLAUDE.md) — то ли
// data.email_id не то поле, что реально приходит в вебхуке, то ли у
// RESEND_API_KEY нет прав на Receiving API (если ключ создавался как
// "Sending access", а не "Full access" — Resend различает эти уровни).
// Пока причина не подтверждена диагностикой — emailId пробуется НЕСКОЛЬКИМИ
// кандидатами полей (email_id/id), не одним, и КАЖДАЯ попытка (успех и
// сбой) логируется целиком через console.error, чтобы в Vercel Runtime
// Logs было видно точную причину при следующем реальном письме.

// Тело письма (text предпочтительнее html — то же самое, что клиент и так
// показывает как есть в whitespace-pre-wrap ленте переписки, сырой html
// читать неудобно). candidateIds — несколько возможных id письма из
// вебхука, пробуются по очереди, пока один не сработает.
export async function fetchReceivedEmailBody(candidateIds) {
  const ids = [...new Set((Array.isArray(candidateIds) ? candidateIds : [candidateIds]).filter(Boolean))];
  if (ids.length === 0) {
    console.error('fetchReceivedEmailBody: нет ни одного кандидата id из вебхука');
    return '';
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY не задан — не могу получить тело письма', ids);
    return '';
  }
  for (const emailId of ids) {
    try {
      const resp = await fetch(`${RESEND_API_BASE}/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      if (!resp.ok) {
        console.error('Не удалось получить тело письма (id-кандидат):', emailId, resp.status, await resp.text());
        continue;
      }
      const json = await resp.json();
      console.error('Тело письма получено, сырой ответ (id-кандидат ' + emailId + '):', JSON.stringify(json).slice(0, 1000));
      // Часть путей Resend отдаёт ресурс сразу, часть (в JS SDK) — обёрнутым в
      // data — поддерживаем оба на всякий случай, не падаем, если формат чуть
      // отличается от задокументированного.
      const email = json?.text != null || json?.html != null ? json : (json?.data ?? json);
      return (typeof email?.text === 'string' && email.text) || (typeof email?.html === 'string' && email.html) || '';
    } catch (err) {
      console.error('Ошибка при получении тела письма (id-кандидат):', emailId, err);
    }
  }
  return '';
}

async function fetchAttachmentsWithDownloadUrls(candidateIds) {
  const ids = [...new Set((Array.isArray(candidateIds) ? candidateIds : [candidateIds]).filter(Boolean))];
  if (ids.length === 0 || !process.env.RESEND_API_KEY) return [];
  for (const emailId of ids) {
    try {
      const resp = await fetch(`${RESEND_API_BASE}/emails/receiving/${emailId}/attachments`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      if (!resp.ok) {
        console.error('Не удалось получить список вложений письма (id-кандидат):', emailId, resp.status, await resp.text());
        continue;
      }
      const json = await resp.json();
      const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      console.error('Список вложений получен (id-кандидат ' + emailId + '):', list.length, 'шт.');
      return list;
    } catch (err) {
      console.error('Ошибка при получении списка вложений письма (id-кандидат):', emailId, err);
    }
  }
  return [];
}

function sanitizeFileName(name) {
  const trimmed = String(name || '').trim();
  const cleaned = trimmed.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 200);
  return cleaned || 'attachment';
}

async function uploadAttachment(bytes, contentType, fileName) {
  const safeName = sanitizeFileName(fileName);
  const path = `purchase-email-attachments/${randomUUID()}-${safeName}`;
  const resp = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${ATTACHMENTS_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': contentType || 'application/octet-stream',
    },
    body: bytes,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Не удалось загрузить вложение: ${text}`);
  }
  return {
    url: `${process.env.SUPABASE_URL}/storage/v1/object/public/${ATTACHMENTS_BUCKET}/${path}`,
    fileName: safeName,
  };
}

// data — уже развёрнутый payload.data события Resend (см. вызывающий код).
// Возвращает DocumentFile[] (см. src/data/contractorDocuments.ts) — то, что
// напрямую кладётся в files письма. Никогда не бросает — сбой одного
// вложения не должен ронять сохранение всего письма.
//
// data.attachments в самом вебхуке — только метаданные (id/filename/
// content_type/content_disposition/content_id), без download_url — он
// приходит ТОЛЬКО из отдельного списочного запроса (см.
// fetchAttachmentsWithDownloadUrls выше), сопоставляем по id.
export async function extractEmailAttachments(data) {
  const rawList = data.attachments ?? data.attachment ?? [];
  if (!Array.isArray(rawList) || rawList.length === 0) {
    console.error('extractEmailAttachments: data.attachments/data.attachment пуст или отсутствует в вебхуке');
    return [];
  }

  const candidateIds = [data.email_id, data.id].filter(Boolean);
  const withUrls = await fetchAttachmentsWithDownloadUrls(candidateIds);
  const urlById = new Map(withUrls.filter((a) => a && a.id).map((a) => [a.id, a.download_url]));

  const files = [];
  for (const raw of rawList) {
    try {
      const fileName = raw.filename ?? raw.file_name ?? raw.name ?? 'attachment';
      const contentType = raw.content_type ?? raw.contentType ?? raw.type ?? 'application/octet-stream';

      // Свои поля вебхука проверяем тоже (inline content/прямой url) — на
      // случай, если формат когда-нибудь изменится и Resend начнёт класть их
      // прямо в вебхук, самый частый путь всё равно download_url по id.
      let bytes = null;
      const inlineContent = raw.content ?? raw.content_base64 ?? raw.base64 ?? null;
      if (typeof inlineContent === 'string' && inlineContent) {
        bytes = Buffer.from(inlineContent, 'base64');
      } else {
        const downloadUrl = urlById.get(raw.id) ?? raw.url ?? raw.download_url ?? raw.content_url ?? null;
        if (typeof downloadUrl === 'string' && downloadUrl) {
          const fileResp = await fetch(downloadUrl);
          if (fileResp.ok) {
            bytes = Buffer.from(await fileResp.arrayBuffer());
          }
        }
      }

      if (!bytes || bytes.length === 0) {
        console.error('Вложение письма пропущено — не найдено содержимое (ни content, ни download_url):', JSON.stringify(raw).slice(0, 300));
        continue;
      }

      files.push(await uploadAttachment(bytes, contentType, fileName));
    } catch (err) {
      console.error('Не удалось обработать вложение письма:', err);
    }
  }
  return files;
}
