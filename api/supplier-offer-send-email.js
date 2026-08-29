// Vercel serverless function: отправка письма поставщику из предложения в
// Ресерче (Suppliers.tsx → lib/supplierOfferEmailsApi.ts →
// sendSupplierOfferEmail). Один в один api/purchase-send-email.js, только
// своя таблица (supplier_offer_emails) и свой префикс адреса (research+,
// не zakupki+) — переписка на этапе "запрашиваем цены у нескольких
// поставщиков" и переписка по уже оформленной закупке живут раздельно
// (см. комментарий в data/supplierOfferEmails.ts).
//
// Только для сотрудников (P0.3 аудита безопасности) — requireStaffAuth,
// как и у остальных приватных api/*.js; клиент вызывает через authFetch.

import { requireStaffAuth } from './_auth.js';

const RESEND_FROM_NAME = 'Redevelopment Закупки';

function supplierOfferEmailAddress(offerId) {
  return `research+${offerId}@redevelopment.pro`;
}

async function insertEmailRow(payload) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/supplier_offer_emails`, {
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

  const { offerId, toAddress, subject, body } = req.body ?? {};

  if (!offerId || !toAddress || !body) {
    res.status(400).json({ error: 'Заполните все поля' });
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    res.status(500).json({ error: 'Не настроен RESEND_API_KEY на сервере' });
    return;
  }

  const fromAddress = supplierOfferEmailAddress(offerId);

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
        subject: subject || 'Запрос цены',
        html: emailHtml(body),
      }),
    });

    if (!resendResp.ok) {
      const text = await resendResp.text();
      throw new Error(`Не удалось отправить письмо: ${text}`);
    }
    const resendJson = await resendResp.json();

    const row = await insertEmailRow({
      offer_id: offerId,
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
