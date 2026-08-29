// Vercel serverless function: отправка письма поставщику из карточки закупки
// (Purchases.tsx → lib/purchaseEmailsApi.ts → sendPurchaseEmail). Письмо
// уходит через Resend с адреса-плюс-закупки (purchaseEmailAddress в
// data/purchases.ts) — благодаря этому ответ поставщика (см.
// purchase-email-webhook.js) прилетает на этот же адрес и матчится по id
// закупки в локальной части, без отдельного ящика на каждую закупку.
// Сама запись в purchase_emails создаётся здесь же сервисным ключом
// (таблица открыта для anon, но отправка письма — не операция анонимного
// клиента, ключ Resend не должен быть на фронте).
//
// Только для сотрудников (P0.3 аудита безопасности) — requireStaffAuth,
// как и у остальных приватных api/*.js; клиент вызывает через authFetch.

import { requireStaffAuth } from './_auth.js';

const RESEND_FROM_NAME = 'Redevelopment Закупки';

function purchaseEmailAddress(purchaseId) {
  return `zakupki+${purchaseId}@redevelopment.pro`;
}

async function insertEmailRow(payload) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/purchase_emails`, {
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

  const { purchaseId, toAddress, subject, body } = req.body ?? {};

  if (!purchaseId || !toAddress || !body) {
    res.status(400).json({ error: 'Заполните все поля' });
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    res.status(500).json({ error: 'Не настроен RESEND_API_KEY на сервере' });
    return;
  }

  const fromAddress = purchaseEmailAddress(purchaseId);

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
        subject: subject || 'Закупка',
        html: emailHtml(body),
      }),
    });

    if (!resendResp.ok) {
      const text = await resendResp.text();
      throw new Error(`Не удалось отправить письмо: ${text}`);
    }
    const resendJson = await resendResp.json();

    const row = await insertEmailRow({
      purchase_id: purchaseId,
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
