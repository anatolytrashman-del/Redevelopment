// Vercel serverless function: первый шаг дистанционного подписания
// соглашения о намерениях. Принимает данные клиента и выбранного кабинета,
// сохраняет запись с одноразовым кодом (сервисным ключом — таблица закрыта
// RLS от анонимного доступа, см. SQL в комментарии к схеме) и отправляет
// код на email через Resend. Код проверяется отдельным эндпоинтом
// agreement-otp-verify.js, который и генерирует итоговый PDF.

import { randomInt } from 'node:crypto';
import { hashOtpCode } from './_otp.js';

const OTP_TTL_MINUTES = 10;
const RESEND_FROM = process.env.RESEND_FROM || 'Redevelopment <signing@redevelopment.pro>';
// P0.4 аудита: без лимита эндпоинт — бесплатный спамер через Resend-домен
// (и источник массового перебора email). Пороги умышленно щедрые — это
// реальный флоу покупателя, не логин: 3 письма/час на email хватает даже
// на "код не пришёл, жду ещё раз" пару раз подряд, 10/час с одного IP —
// на случай пары интересантов за одним NAT.
const MAX_REQUESTS_PER_EMAIL_PER_HOUR = 3;
const MAX_REQUESTS_PER_IP_PER_HOUR = 10;

async function countRecentRequests(field, value, sinceIso) {
  const url =
    `${process.env.SUPABASE_URL}/rest/v1/agreement_signatures?select=id&` +
    `${field}=eq.${encodeURIComponent(value)}&created_at=gte.${encodeURIComponent(sinceIso)}`;
  const resp = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  if (!resp.ok) throw new Error('Не удалось проверить лимит запросов');
  const contentRange = resp.headers.get('content-range');
  const total = contentRange ? Number(contentRange.split('/')[1]) : 0;
  return Number.isFinite(total) ? total : 0;
}

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

// Вёрстка письма — табличная, инлайн-стили, без внешних картинок и шрифтов:
// почтовые клиенты (особенно Outlook) не поддерживают ни бэкграунд-блюр
// сайта, ни веб-шрифты, ни внешние ассеты со стабильной загрузкой, поэтому
// "стиль лендинга" здесь — тот же цветовой код и текстовый вордмарк
// ("RED" красным + "EVELOPMENT" тёмным), что и в шапке сайта, а не копия вёрстки.
function otpEmailHtml({ code, unitLabel }) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0efed;padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e7e5e2;border-radius:20px;">
            <tr>
              <td style="padding:36px 32px 8px;text-align:center;">
                <span style="font-size:20px;font-weight:800;letter-spacing:0.02em;">
                  <span style="color:#e4152b;">RED</span><span style="color:#14151a;">EVELOPMENT</span>
                </span>
              </td>
            </tr>
            ${unitLabel ? `
            <tr>
              <td style="padding:0 32px;text-align:center;">
                <span style="display:inline-block;margin-top:8px;padding:4px 12px;border-radius:999px;background:#f5f4f2;color:#6b6d76;font-size:12px;font-weight:600;">${unitLabel}</span>
              </td>
            </tr>` : ''}
            <tr>
              <td style="padding:24px 32px 4px;text-align:center;color:#14151a;font-size:15px;">
                Код для подписания соглашения о намерениях
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#fde3e5;border-radius:16px;">
                  <tr>
                    <td style="padding:16px 28px;font-size:36px;font-weight:800;letter-spacing:0.25em;color:#14151a;">
                      ${code}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;text-align:center;color:#9a9ba3;font-size:13px;">
                Код действует ${OTP_TTL_MINUTES} минут
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;">
                <hr style="border:none;border-top:1px solid #e7e5e2;margin:0 0 20px;" />
                <p style="margin:0;color:#9a9ba3;font-size:12px;line-height:1.6;text-align:center;">
                  Если вы не запрашивали подписание — просто проигнорируйте это письмо.<br />
                  redevelopment.pro
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

async function sendOtpEmail(email, code, unitLabel) {
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
      html: otpEmailHtml({ code, unitLabel }),
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
    buyerCitizenship,
    buyerPassport,
    buyerPassportIssued,
    buyerAddress,
    email,
  } = req.body ?? {};

  if (
    !leadId ||
    !objectId ||
    !zoneId ||
    // Для рабочего места (isWorkstation) площадь не имеет смысла и приходит
    // с фронта как 0 (см. zoneArea={selectedZone.area ?? 0} в
    // PublicPlanAndUnits) — !zoneArea тут ошибочно считал 0 отсутствующим
    // полем и блокировал подписание для всех рабочих мест.
    (!isWorkstation && !zoneArea) ||
    !buyerName ||
    !buyerGender ||
    !buyerCitizenship ||
    !buyerPassport ||
    !buyerAddress ||
    !email
  ) {
    res.status(400).json({ error: 'Заполните все поля' });
    return;
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwardedFor) ? forwardedFor[0] : (forwardedFor ?? '').split(',')[0].trim() || null;

  try {
    const sinceIso = new Date(Date.now() - 60 * 60_000).toISOString();
    const [emailCount, ipCount] = await Promise.all([
      countRecentRequests('email', email, sinceIso),
      ip ? countRecentRequests('ip', ip, sinceIso) : Promise.resolve(0),
    ]);
    if (emailCount >= MAX_REQUESTS_PER_EMAIL_PER_HOUR || ipCount >= MAX_REQUESTS_PER_IP_PER_HOUR) {
      res.status(429).json({ error: 'Слишком много запросов кода. Попробуйте позже.' });
      return;
    }

    const code = String(randomInt(100000, 1000000));

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
      buyer_citizenship: buyerCitizenship,
      buyer_passport: buyerPassport,
      buyer_passport_issued: buyerPassportIssued ?? '',
      buyer_address: buyerAddress,
      email,
      otp_code_hash: hashOtpCode(code),
      otp_expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
      ip,
      user_agent: req.headers['user-agent'] ?? null,
    });

    const unitLabel = isWorkstation
      ? `Рабочее место ${zoneLabel || ''}`.trim()
      : `Кабинет ${zoneLabel || ''}${zoneArea ? ` · ${zoneArea} м²` : ''}`.trim();
    await sendOtpEmail(email, code, unitLabel);

    res.status(200).json({ signatureId: row.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось отправить код' });
  }
}
