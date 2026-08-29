// Vercel serverless function: приём входящих писем через Resend Inbound
// Webhook. Домен/MX/webhook уже настроены владельцем (2026-08-28, см.
// журнал CLAUDE.md) — этот эндпоинт зарегистрирован в кабинете Resend как
// единственный обработчик входящей почты на домене.
//
// Несмотря на название файла (осталось от первой версии — переименовывать
// не стали, чтобы не заставлять владельца ещё раз лезть в кабинет Resend и
// менять зарегистрированный URL), обрабатывает ДВА разных случая по
// префиксу адреса в "to": zakupki+<purchaseId>@ — переписка по закупке
// (purchase_emails), research+<offerId>@ — переписка по предложению в
// Ресерче поставщиков, ещё до того как оно превратилось в закупку
// (supplier_offer_emails). Resend не даёт настроить доставку webhook по
// конкретному адресу получателя — сюда прилетает вообще любое входящее
// письмо на домене, дальше уже сами решаем, что с ним делать.
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
// Формат тела запроса взят из документации Resend Inbound (событие с
// полем "to"/"from"/"subject"/"text" и т.п.) — не проверен вживую на
// реальном письме, при первом реальном письме может понадобиться поправить
// разбор под фактический payload.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { extractEmailAttachments } from './_attachments.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

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

function extractId(toAddress, prefix) {
  const re = new RegExp(`${prefix}\\+([0-9a-f-]{36})@`, 'i');
  const match = String(toAddress || '').match(re);
  return match ? match[1] : null;
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

    const toRaw = data.to;
    const toAddress = Array.isArray(toRaw) ? toRaw[0] : toRaw;
    const fromAddress = data.from ?? '';
    const subject = data.subject ?? '';
    const body = data.text ?? data.html ?? '';

    const purchaseId = extractId(toAddress, 'zakupki');
    const offerId = purchaseId ? null : extractId(toAddress, 'research');

    if (!purchaseId && !offerId) {
      // Письмо не на наш plus-адрес (ни закупка, ни предложение) — не наша
      // забота, но и не ошибка самого вебхука (Resend не должен ретраить
      // бесконечно).
      res.status(200).json({ skipped: true });
      return;
    }

    const files = await extractEmailAttachments(data);

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
      : await insertEmailRow('supplier_offer_emails', {
          offer_id: offerId,
          direction: 'in',
          from_address: fromAddress,
          to_address: toAddress || '',
          subject,
          body,
          files,
          resend_message_id: data.email_id ?? data.id ?? null,
        });

    res.status(200).json({ email: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось обработать письмо' });
  }
}
