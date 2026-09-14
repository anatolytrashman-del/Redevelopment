// Разовый (но повторно безопасный) прогон по УЖЕ полученным письмам
// поставщиков: распознать счета там, где распознавания не было вовсе, и
// записать в базу то, что висит нераспознанным/неподтверждённым.
//
// Владелец, 2026-09-12: "мне нужно автоматическое распознавание счетов и
// запись в базу ещё до открытия письма нами вручную. В том числе сделай это
// для полученных счетов". Первая половина — код приёма письма
// (api/purchase-email-webhook.js + _invoiceApply.js); эта вторая половина
// разбирает то, что накопилось в переписке до него.
//
// Что делает с каждым ВХОДЯЩИМ письмом поставщика:
//   • extraction пуст ИЛИ status:'none' (прошлый прогон/вебхук счёта не
//     нашёл — см. api/purchase-email-webhook.js), но есть вложения →
//     распознаёт (тем же кодом, что и вебхук) и, если это счёт, записывает
//     в карточку;
//   • extraction.status = 'pending' (распознано, но человек так и не нажал
//     "Подтвердить") → записывает в карточку;
//   • 'confirmed' / 'dismissed' → не трогает: первое уже в базе, второе
//     человек осознанно отклонил.
//
// Повторный запуск безопасен — перед записью проверяется, не попал ли этот
// счёт в карточку раньше другим путём (см. alreadyApplied). Это не
// теоретическая предосторожность: на первом прогоне 2026-09-12 счёт №1806
// ГРИЛЬЯТО-Мастер, заведённый в карточку ещё вручную, добавился вторым КП,
// а вместе с ним вернулся и счёт №1804, который владелец за день до этого
// просил удалить как ошибочный ("счет не Ваш"). Оба применения откатаны по
// снимку extraction.applied, письмо №1804 помечено 'dismissed'.
//
// Запуск:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... PROXYAPI_KEY=... \
//     node scripts/backfill-invoice-recognition.mjs [--dry-run] [--limit=N]
//
// CHECKO_API_KEY необязателен — без него просто не будет автопроверки
// благонадёжности по найденным ИНН (она и так делается отдельно).
import { recognizeAllInvoicesFromAttachments, estimatePdfPageCount } from '../api/_invoiceRecognition.js';
import { applyRecognizedInvoice, quoteTitle } from '../api/_invoiceApply.js';
import { saveReliabilityIfNew } from '../api/_checko.js';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0);
// Разобрать одно конкретное письмо (по id или его началу) — когда владелец
// показывает конкретную переписку, где счёт не распознался, гонять весь
// архив ради неё незачем.
const ONLY_EMAIL = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1] ?? null;

const auth = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
};

async function rest(path, init) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...auth, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!resp.ok) throw new Error(`Supabase ${init?.method ?? 'GET'} ${path}: ${resp.status} ${await resp.text()}`);
  return resp.status === 204 ? null : resp.json();
}

// В базе у файла письма хранятся только url и fileName — pageCount и size
// (по ним отбираются кандидаты на распознавание, см. pickInvoiceCandidates)
// считаются на приёме письма и никуда не сохраняются. Для старых писем
// добираем их, скачав файл: бакет публичный, файлы небольшие.
async function withFileMetrics(files) {
  const out = [];
  for (const f of Array.isArray(files) ? files : []) {
    if (!f?.url) continue;
    const ext = String(f.fileName || '').split('.').pop()?.toLowerCase();
    try {
      const resp = await fetch(f.url);
      if (!resp.ok) {
        console.warn(`  не скачался ${f.fileName} (${resp.status}) — пропуск`);
        continue;
      }
      const bytes = Buffer.from(await resp.arrayBuffer());
      out.push({ ...f, size: bytes.length, pageCount: ext === 'pdf' ? estimatePdfPageCount(bytes) : 1 });
    } catch (err) {
      console.warn(`  не скачался ${f.fileName}: ${err.message}`);
    }
  }
  return out;
}

// Не попал ли этот счёт в карточку раньше — двумя признаками: уже есть
// строка КП с этим письмом-источником, либо сам файл счёта уже прикреплён к
// карточке поставщика (так делает и ручное подтверждение в переписке, и
// загрузка счёта в форму предложения).
// 2026-09-14: проверка идёт по КОНКРЕТНОМУ файлу счёта, а не по письму
// целиком. В письме может быть несколько счетов (владелец: "в письме два
// счета, а распознался и записался в базу только 1"), и признак "по этому
// письму КП уже заведено" отсекал бы второй счёт как дубль первого.
async function alreadyApplied(email, sourceFile) {
  if (!sourceFile?.url) {
    const quotes = await rest(`supplier_offer_quotes?source_email_id=eq.${email.id}&select=id&limit=1`);
    return quotes.length > 0 ? 'КП по этому письму уже заведено' : null;
  }
  const quotes = await rest(`supplier_offer_quotes?source_email_id=eq.${email.id}&select=id,files`);
  if (quotes.some((q) => (q.files ?? []).some((f) => f?.url === sourceFile.url))) return 'КП по этому счёту уже заведено';
  if (email.offer_id) {
    const [offer] = await rest(`supplier_research_offers?id=eq.${email.offer_id}&select=files`);
    if ((offer?.files ?? []).some((f) => f?.url === sourceFile.url)) return 'файл счёта уже прикреплён к карточке';
  }
  return null;
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
  }

  const emails = await rest(
    'supplier_offer_emails?direction=eq.in&select=id,offer_id,order_id,subject,body,files,extraction&order=created_at.asc',
  );
  console.log(`Входящих писем поставщиков: ${emails.length}${DRY_RUN ? ' (сухой прогон)' : ''}`);

  const stats = { recognized: 0, applied: 0, notInvoice: 0, skipped: 0, failed: 0 };
  let processed = 0;

  for (const email of emails) {
    if (ONLY_EMAIL && !email.id.startsWith(ONLY_EMAIL)) continue;
    const status = email.extraction?.status ?? null;
    if (status === 'confirmed' || status === 'dismissed') {
      stats.skipped += 1;
      continue;
    }
    if (LIMIT && processed >= LIMIT) break;

    const label = `${email.subject || '(без темы)'} [${email.id.slice(0, 8)}]`;
    try {
      // status:'none' — это НЕ результат распознавания, а протокол неудачной
      // попытки (isInvoice:false, ни цены, ни позиций). Применять его в
      // карточку нельзя, прогонять заново — можно и нужно: именно так
      // разбираются письма, где счёт не дошёл до модели из-за старого бага.
      //
      // 2026-09-14: письмо может нести НЕСКОЛЬКО счетов (владелец: "в письме
      // два счета, а распознался и записался в базу только 1"). Первый
      // лежит в корне extraction, остальные — в additionalInvoices; здесь
      // они сразу приводятся к одному списку, как это делает интерфейс
      // (extractionInvoices в src/data/supplierOfferEmails.ts).
      const stored = email.extraction?.status === 'none' ? null : email.extraction;
      let invoices = stored
        ? [
            {
              price: stored.price ?? null,
              currency: stored.currency ?? null,
              items: stored.items ?? [],
              supplierInn: stored.supplierInn ?? null,
              sourceFile: stored.sourceFile ?? null,
            },
            ...(stored.additionalInvoices ?? []),
          ]
        : null;

      if (!invoices) {
        const attachments = await withFileMetrics(email.files);
        // Тот же перебор кандидатов, что и на приёме письма, — специально
        // общей функцией, чтобы прогон по архиву и живой вебхук не разошлись
        // в том, что считают счётом.
        // Контекст письма — тот же, что и на живом приёме (см.
        // emailContextBlock в api/_invoiceRecognition.js).
        const result = await recognizeAllInvoicesFromAttachments(attachments, { subject: email.subject, body: email.body });
        if (result.attempts.length === 0 && result.skipped.length === 0) {
          stats.skipped += 1;
          continue;
        }
        processed += 1;
        console.log(`\n${label}`);
        for (const a of result.attempts) console.log(`  ${a.fileName} → ${a.outcome}`);
        for (const sk of result.skipped) console.log(`  ${sk.fileName} — не пробовали: ${sk.reason}`);
        if (result.allRecognized.length === 0) {
          console.log('  не счёт — ничего не пишем');
          stats.notInvoice += 1;
          // Протокол неудачи всё же сохраняем (status:'none') — чтобы
          // "почему этот счёт не распознался" в следующий раз закрывался
          // запросом к базе, а не разбором кода (см. тот же статус в
          // api/purchase-email-webhook.js).
          if (!DRY_RUN) {
            await rest(`supplier_offer_emails?id=eq.${email.id}`, {
              method: 'PATCH',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({
                extraction: {
                  status: 'none',
                  isInvoice: false,
                  price: null,
                  currency: null,
                  items: [],
                  supplierInn: null,
                  sourceFile: null,
                  recognizedAt: new Date().toISOString(),
                  attempts: result.attempts,
                  skipped: result.skipped,
                },
              }),
            });
          }
          continue;
        }
        invoices = result.allRecognized.map(({ recognized, candidate }) => ({
          ...recognized,
          sourceFile: { url: candidate.url, fileName: candidate.fileName },
        }));
        stats.recognized += invoices.length;
        for (const inv of invoices) {
          console.log(`  счёт: ${inv.price ?? '—'} ${inv.currency ?? ''}, позиций ${inv.items.length}, ИНН ${inv.supplierInn ?? '—'} (${inv.sourceFile.fileName})`);
        }
      } else {
        processed += 1;
        console.log(`\n${label}\n  уже распознан (pending), счетов ${invoices.length}`);
      }

      if (DRY_RUN) {
        console.log('  сухой прогон — запись пропущена');
        continue;
      }

      // Каждый счёт письма записывается отдельно и со своим снимком
      // applied: сверка позиций со сметой и откат в интерфейсе работают
      // по конкретному счёту, а не по письму целиком.
      const appliedByUrl = new Map();
      for (const invoice of invoices) {
        const seen = await alreadyApplied(email, invoice.sourceFile);
        if (seen) {
          console.log(`  пропуск ${invoice.sourceFile?.fileName ?? ''} — ${seen}`);
          stats.skipped += 1;
          continue;
        }
        await saveReliabilityIfNew(invoice.supplierInn);
        const applied = await applyRecognizedInvoice({
          emailId: email.id,
          offerId: email.offer_id,
          orderId: email.order_id,
          subject: email.subject,
          recognized: invoice,
          sourceFile: invoice.sourceFile,
          title: quoteTitle(email.subject, invoice.sourceFile?.fileName ?? null, invoices.length > 1),
        });
        if (invoice.sourceFile?.url) appliedByUrl.set(invoice.sourceFile.url, applied);
        stats.applied += 1;
        console.log(`  записано в ${applied.target === 'order' ? 'заявку' : 'карточку поставщика'}${applied.quoteId ? ' + строка КП' : ''}`);
      }
      if (appliedByUrl.size === 0) continue;

      const [firstInvoice, ...restInvoices] = invoices;
      await rest(`supplier_offer_emails?id=eq.${email.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          extraction: {
            status: appliedByUrl.size === invoices.length ? 'confirmed' : 'pending',
            isInvoice: true,
            price: firstInvoice.price ?? null,
            currency: firstInvoice.currency ?? null,
            items: firstInvoice.items ?? [],
            supplierInn: firstInvoice.supplierInn ?? null,
            sourceFile: firstInvoice.sourceFile ?? null,
            recognizedAt: email.extraction?.recognizedAt ?? new Date().toISOString(),
            appliedAutomatically: true,
            applied: appliedByUrl.get(firstInvoice.sourceFile?.url) ?? null,
            ...(restInvoices.length > 0 && {
              additionalInvoices: restInvoices.map((inv) => ({
                ...inv,
                applied: appliedByUrl.get(inv.sourceFile?.url) ?? null,
              })),
            }),
          },
        }),
      });
    } catch (err) {
      stats.failed += 1;
      console.error(`  ОШИБКА на ${label}: ${err.message}`);
    }
  }

  console.log(`\nИтого: распознано ${stats.recognized}, записано ${stats.applied}, не счёт ${stats.notInvoice}, пропущено ${stats.skipped}, ошибок ${stats.failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
