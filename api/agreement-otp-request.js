// Vercel serverless function: первый шаг дистанционного подписания
// соглашения о намерениях. Принимает данные клиента и выбранного кабинета,
// сохраняет запись с одноразовым кодом (сервисным ключом — таблица закрыта
// RLS от анонимного доступа, см. SQL в комментарии к схеме) и отправляет
// код на email через Resend. Код проверяется отдельным эндпоинтом
// agreement-otp-verify.js, который и генерирует итоговый PDF.

import { randomInt } from 'node:crypto';

const OTP_TTL_MINUTES = 10;
const RESEND_FROM = process.env.RESEND_FROM || 'Redevelopment <signing@redevelopment.pro>';

async function insertSignatureRow(payload) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/agreement_signatures`, {
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
    throw new Error(`Не удалось сохранить заявку на подписание: ${text}`);
  }
  const rows = await resp.json();
  return rows[0];
}

async function sendOtpEmail(email, code) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [email],
      subject: `Код подтверждения: ${code}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <p>Код для подписания соглашения о намерениях на redevelopment.pro:</p>
          <p style="font-size: 32px; font-weight: 700; letter-spacing: 4px;">${code}</p>
          <p style="color: #888; font-size: 13px;">Код действует ${OTP_TTL_MINUTES} минут. Если вы не запрашивали подписание — просто игнорируйте это письмо.</p>
        </div>
      `,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Не удалось отправить письмо с кодом: ${text}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const {
    leadId,
    objectId,
    zoneId,
    zoneArea,
    zoneFloorLabel,
    zoneLabel,
    isWorkstation,
    buyerName,
    buyerGender,
    buyerPassport,
    buyerPassportIssued,
    buyerAddress,
    email,
  } = req.body ?? {};

  if (
    !leadId ||
    !objectId ||
    !zoneId ||
    !zoneArea ||
    !buyerName ||
    !buyerGender ||
    !buyerPassport ||
    !buyerAddress ||
    !email
  ) {
    res.status(400).json({ error: 'Заполните все поля' });
    return;
  }

  try {
    const code = String(randomInt(100000, 1000000));
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwardedFor) ? forwardedFor[0] : (forwardedFor ?? '').split(',')[0].trim() || null;

    const row = await insertSignatureRow({
      lead_id: leadId,
      object_id: objectId,
      zone_id: zoneId,
      zone_area: zoneArea,
      zone_floor_label: zoneFloorLabel ?? '',
      zone_label: zoneLabel ?? '',
      is_workstation: !!isWorkstation,
      buyer_name: buyerName,
      buyer_gender: buyerGender,
      buyer_passport: buyerPassport,
      buyer_passport_issued: buyerPassportIssued ?? '',
      buyer_address: buyerAddress,
      email,
      otp_code: code,
      otp_expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
      ip,
      user_agent: req.headers['user-agent'] ?? null,
    });

    await sendOtpEmail(email, code);

    res.status(200).json({ signatureId: row.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось отправить код' });
  }
}
