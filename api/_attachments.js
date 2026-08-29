// Общий хелпер для api/*.js: скачивает вложения из входящего письма Resend
// Inbound и заливает их в бакет object-documents (тот же публичный бакет,
// что уже используется для счетов/КП в сметах — не заводим отдельный ради
// одного нового источника файлов). Используется purchase-email-webhook.js,
// а позже и вебхуком переписки по Ресерчу поставщиков — единая логика,
// не дублировать.
//
// ВАЖНО: точный формат поля "attachments" во входящем payload Resend не
// проверен вживую (домен resend.com недоступен из песочницы разработки —
// не было возможности свериться с документацией на живых примерах).
// Extraction написан защитно — перебирает несколько вероятных вариантов
// названий полей (filename/file_name/name, content/content_base64/base64,
// url/download_url/content_url) и молча пропускает вложение, если ни один
// не подошёл, вместо падения всего письма. При первом реальном письме с
// вложением — свериться с фактическим payload (залогирован через
// console.error при неудаче) и поправить при необходимости.

import { randomUUID } from 'node:crypto';

const ATTACHMENTS_BUCKET = 'object-documents';

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
export async function extractEmailAttachments(data) {
  const rawList = data.attachments ?? data.attachment ?? [];
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const files = [];
  for (const raw of rawList) {
    try {
      const fileName = raw.filename ?? raw.file_name ?? raw.name ?? 'attachment';
      const contentType = raw.content_type ?? raw.contentType ?? raw.type ?? 'application/octet-stream';

      let bytes = null;
      const inlineContent = raw.content ?? raw.content_base64 ?? raw.base64 ?? null;
      if (typeof inlineContent === 'string' && inlineContent) {
        bytes = Buffer.from(inlineContent, 'base64');
      } else {
        const downloadUrl = raw.url ?? raw.download_url ?? raw.content_url ?? null;
        if (typeof downloadUrl === 'string' && downloadUrl) {
          const fileResp = await fetch(downloadUrl);
          if (fileResp.ok) {
            bytes = Buffer.from(await fileResp.arrayBuffer());
          }
        }
      }

      if (!bytes || bytes.length === 0) {
        console.error('Вложение письма пропущено — не найдено содержимое (ни content, ни url):', JSON.stringify(raw).slice(0, 300));
        continue;
      }

      files.push(await uploadAttachment(bytes, contentType, fileName));
    } catch (err) {
      console.error('Не удалось обработать вложение письма:', err);
    }
  }
  return files;
}
