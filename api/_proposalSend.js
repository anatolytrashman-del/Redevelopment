// Отправка предложения на утверждение руководителю стройки.
//
// Владелец, 2026-09-15 («делай всё и на прод» по списку идей к «Сравнению
// цен»): раньше отбор позиций уходил руководителю руками — «Скачать PDF» и
// переслать. Теперь кнопка «Отправить на утверждение» в самой карточке:
// клиент собирает письмо (html — тот же лист согласования, что и в PDF, но
// в email-совместимой вёрстке, см. buildProposalEmailHtml в
// components/suppliers/priceComparisonPrint.ts), а здесь оно уходит через
// Resend. Ключ Resend — только на сервере, поэтому серверная функция, а не
// прямой вызов с фронта.
//
// Живёт веткой `kind: 'proposal'` внутри api/purchase-send-email.js, а не
// своим файлом: в api/ ровно 12 serverless-функций — лимит Vercel Hobby,
// тринадцатый файл уронил деплой целиком (2026-09-15, проверено на живом
// билде). Авторизацию (requireStaffAuth) делает вызывающий обработчик.
//
// Ответ руководителя должен прийти человеку, а не в вебхук переписки с
// поставщиками: reply_to — почта владельца (PROPOSAL_REPLY_TO), копия туда
// же, чтобы отправленное предложение было и в его ящике.

const FROM = process.env.PROPOSAL_FROM || 'Анатолий Трэшмен <zakupki@redevelopment.pro>';
const REPLY_TO = process.env.PROPOSAL_REPLY_TO || 'anatoly.trashman@gmail.com';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleProposalSend(req, res) {
  if (!process.env.RESEND_API_KEY) {
    res.status(500).json({ error: 'RESEND_API_KEY не настроен на Vercel' });
    return;
  }

  const { to, subject, html, text } = req.body ?? {};
  const recipients = String(to ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (recipients.length === 0 || recipients.some((r) => !EMAIL_RE.test(r))) {
    res.status(400).json({ error: 'Укажите корректный email получателя' });
    return;
  }
  if (typeof subject !== 'string' || !subject.trim()) {
    res.status(400).json({ error: 'Пустая тема письма' });
    return;
  }
  if (typeof html !== 'string' || html.length < 20 || html.length > 900_000) {
    res.status(400).json({ error: 'Пустое или слишком большое письмо' });
    return;
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: recipients,
      cc: recipients.includes(REPLY_TO) ? undefined : [REPLY_TO],
      reply_to: REPLY_TO,
      subject: subject.trim(),
      html,
      text: typeof text === 'string' && text.trim() ? text : undefined,
    }),
  });
  const body = await resp.text();
  if (!resp.ok) {
    const status = resp.status === 429 ? 429 : 502;
    res.status(status).json({
      error:
        resp.status === 429
          ? 'Resend временно отказал (лимит писем) — попробуйте через несколько минут'
          : `Не удалось отправить письмо (${resp.status}): ${body.slice(0, 300)}`,
    });
    return;
  }
  let id = null;
  try {
    id = JSON.parse(body)?.id ?? null;
  } catch {
    /* Resend всегда отвечает JSON, но письмо уже ушло — id не критичен */
  }
  res.status(200).json({ ok: true, id, to: recipients });
}
