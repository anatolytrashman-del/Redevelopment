// Vercel serverless function: отправка письма поставщику — из карточки
// закупки (Purchases.tsx → lib/purchaseEmailsApi.ts → sendPurchaseEmail)
// ИЛИ из предложения в Ресерче поставщиков (Suppliers.tsx →
// lib/supplierOfferEmailsApi.ts → sendSupplierOfferEmail). Несмотря на имя
// файла (осталось от первой версии), обрабатывает оба случая — так же, как
// purchase-email-webhook.js уже объединяет приём входящих писем для обоих:
// на Hobby-плане Vercel лимит 12 serverless-функций на деплой, отдельный
// файл под каждую пару send/receive быстро упёрся бы в потолок (реальный
// инцидент 2026-08-29 — деплой упал с "No more than 12 Serverless
// Functions", после чего два файла отправки объединили в этот один).
//
// Письмо уходит через Resend с адреса-плюс-закупки/предложения
// (purchaseEmailAddress/supplierOfferEmailAddress) — благодаря этому ответ
// прилетает на этот же адрес и матчится по id в локальной части, без
// отдельного ящика на каждую сущность. Запись создаётся здесь же сервисным
// ключом (таблицы закрыты RLS от anon — отправка письма не операция
// анонимного клиента, ключ Resend не должен быть на фронте).
//
// Только для сотрудников (P0.3 аудита безопасности) — requireStaffAuth,
// как и у остальных приватных api/*.js; клиент вызывает через authFetch.

import { requireStaffAuth } from './_auth.js';

const RESEND_FROM_NAME = 'Redevelopment Закупки';

// Технический адрес переписки строится из короткого кода (short_code,
// 5 hex-символов, генерируется в БД), не из полного UUID — владелец,
// 2026-09-03: адрес с UUID был "очень длинный". short_code читается той же
// строкой, что и id, поэтому нужен отдельный запрос на его получение перед
// отправкой (сама запись создаётся раньше, в момент добавления закупки/
// предложения, — здесь только шлём письмо).
function purchaseEmailAddress(shortCode) {
  return `zakupki+${shortCode}@redevelopment.pro`;
}

function supplierOfferEmailAddress(shortCode) {
  return `research+${shortCode}@redevelopment.pro`;
}

async function fetchShortCode(table, id) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&select=short_code`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows[0]?.short_code ?? null;
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
    throw new Error(`Не удалось сохранить письмо: ${text}`);
  }
  const rows = await resp.json();
  return rows[0];
}

function emailHtml(body) {
  const escaped = String(body)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#14151a;white-space:pre-wrap;">${escaped}</div>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await requireStaffAuth(req, res);
  if (!user) return;

  const { purchaseId, offerId, toAddress, subject, body } = req.body ?? {};

  if ((!purchaseId && !offerId) || !toAddress || !body) {
    res.status(400).json({ error: 'Заполните все поля' });
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    res.status(500).json({ error: 'Не настроен RESEND_API_KEY на сервере' });
    return;
  }

  const shortCode = purchaseId
    ? await fetchShortCode('purchases', purchaseId)
    : await fetchShortCode('supplier_research_offers', offerId);
  if (!shortCode) {
    res.status(404).json({ error: 'Не найдена закупка или предложение' });
    return;
  }

  const fromAddress = purchaseId ? purchaseEmailAddress(shortCode) : supplierOfferEmailAddress(shortCode);
  const table = purchaseId ? 'purchase_emails' : 'supplier_offer_emails';
  const idField = purchaseId ? 'purchase_id' : 'offer_id';
  const idValue = purchaseId ?? offerId;
  const defaultSubject = purchaseId ? 'Закупка' : 'Запрос цены';

  try {
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${RESEND_FROM_NAME} <${fromAddress}>`,
        to: [toAddress],
        subject: subject || defaultSubject,
        html: emailHtml(body),
      }),
    });

    if (!resendResp.ok) {
      const text = await resendResp.text();
      throw new Error(`Не удалось отправить письмо: ${text}`);
    }
    const resendJson = await resendResp.json();

    const row = await insertEmailRow(table, {
      [idField]: idValue,
      direction: 'out',
      from_address: fromAddress,
      to_address: toAddress,
      subject: subject || '',
      body,
      resend_message_id: resendJson?.id ?? null,
    });

    res.status(200).json({ email: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось отправить письмо' });
  }
}
