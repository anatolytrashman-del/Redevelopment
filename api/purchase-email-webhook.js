// Vercel serverless function: приём входящих писем поставщиков через Resend
// Inbound Webhook. НЕ РАБОТАЕТ САМА ПО СЕБЕ без ручной настройки на стороне
// владельца (см. журнал CLAUDE.md, запись про "Закупки"):
//   1. В кабинете Resend включить Inbound для домена redevelopment.pro.
//   2. Добавить/поменять MX-записи домена так, как укажет Resend.
//   3. Зарегистрировать в кабинете Resend этот URL как webhook-эндпоинт
//      (https://redevelopment.pro/api/purchase-email-webhook) для события
//      "email.received" (или аналогичного — по документации Resend Inbound
//      на момент настройки).
//   4. Если Resend подписывает вебхуки (svix-подобная подпись) — добавить
//      секрет в Vercel env (RESEND_WEBHOOK_SECRET) и проверять подпись
//      здесь перед обработкой; пока проверка не реализована.
//
// Формат тела запроса взят из документации Resend Inbound (событие с
// полем "to"/"from"/"subject"/"text" и т.п.) — не проверен вживую (эндпоинт
// ещё не зарегистрирован), при первом реальном письме может понадобиться
// поправить разбор под фактический payload.

function extractPurchaseId(toAddress) {
  const match = String(toAddress || '').match(/zakupki\+([0-9a-f-]{36})@/i);
  return match ? match[1] : null;
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

  try {
    const payload = req.body ?? {};
    // Resend оборачивает событие в { type, data } — data содержит сами
    // поля письма (to/from/subject/text). Поддерживаем и "плоский" вид на
    // случай отличающегося формата.
    const data = payload.data ?? payload;

    const toRaw = data.to;
    const toAddress = Array.isArray(toRaw) ? toRaw[0] : toRaw;
    const fromAddress = data.from ?? '';
    const subject = data.subject ?? '';
    const body = data.text ?? data.html ?? '';

    const purchaseId = extractPurchaseId(toAddress);
    if (!purchaseId) {
      // Письмо не на наш plus-адрес закупки — не наша забота, но и не ошибка
      // самого вебхука (Resend не должен ретраить бесконечно).
      res.status(200).json({ skipped: true });
      return;
    }

    const row = await insertEmailRow({
      purchase_id: purchaseId,
      direction: 'in',
      from_address: fromAddress,
      to_address: toAddress || '',
      subject,
      body,
      resend_message_id: data.email_id ?? data.id ?? null,
    });

    res.status(200).json({ email: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось обработать письмо' });
  }
}
