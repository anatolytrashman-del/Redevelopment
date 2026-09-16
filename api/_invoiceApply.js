// Автоматическая ЗАПИСЬ распознанного счёта в базу — то, что раньше делал
// только человек кнопкой "Подтвердить и заполнить карточку" в переписке
// (handleConfirmAutoExtraction в SupplierCorrespondenceTab.tsx).
//
// Владелец, 2026-09-12: "снова вручную нудно подтверждать счёт для записи в
// базу данных... мне нужно автоматическое распознавание счетов и запись в
// базу ещё до открытия письма нами вручную". До этой правки распознавание
// действительно работало само (на приёме письма), но результат ложился в
// email.extraction со status:'pending' и до карточки поставщика не доходил,
// пока закупщица не откроет письмо и не нажмёт кнопку — то есть цифры в
// сравнении цен появлялись только после ручного действия.
//
// Теперь запись делает сервер, на приёме письма. Сохраняется ровно та же
// семантика, что была у ручного подтверждения (ниже по пунктам — как в
// applyExtractionToOffer/applyExtractionToOrder/saveExtractionAsQuote на
// клиенте), чтобы автоматический и ручной путь не разошлись:
//   • позиции ДОБАВЛЯЮТСЯ к уже существующим, не затирают;
//   • файл счёта прикрепляется к карточке с дедупликацией по url;
//   • валюта берётся из счёта только если она распознана и известна нам
//     (модели запрещено гадать — см. промпт в _invoiceRecognition.js);
//   • уже сохранённый ИНН не затирается пустым;
//   • каждое распознавание = отдельная строка supplier_offer_quotes.
//
// С 2026-09-16 (шаг 5 плана закупок) позиции пишутся УЖЕ сопоставленными с
// ведомостью запроса: та же модель и те же правила, что у кнопки «Предложить
// сопоставление» (suggestMatches в _proposalMatches.js). Раньше здесь стояло
// «сопоставление остаётся ручным шагом» со ссылкой на владельца («давай
// сверять вручную», 2026-09-04) — ручная сверка никуда не делась, изменилось
// другое: человек больше не перебивает вручную ВСЁ подряд, а проверяет только
// то, где модель сама не уверена. Каждая позиция несёт matchConfidence, и
// сравнение цен помечает «проверить» всё, что ниже порога или размечено как
// 'check'. Сбой сопоставления не мешает записи счёта: позиции лягут без
// привязки, ровно как раньше.
//
// Отдельный файл с "_" в начале — общий хелпер, не считается в лимит 12
// serverless-функций Vercel Hobby (как _invoiceRecognition.js/_checko.js).
import { randomUUID } from 'node:crypto';
import { suggestMatches } from './_proposalMatches.js';

const KNOWN_CURRENCIES = ['RUB', 'USD', 'EUR', 'BYN'];

function authHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

async function restGet(path) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`Supabase GET ${path}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function restPatch(path, body) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Supabase PATCH ${path}: ${resp.status} ${await resp.text()}`);
}

async function restInsert(table, body) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Supabase POST ${table}: ${resp.status} ${await resp.text()}`);
  const rows = await resp.json();
  return rows[0];
}

function normalizedCurrency(recognizedCurrency, fallback) {
  const value = String(recognizedCurrency || '').toUpperCase();
  return KNOWN_CURRENCIES.includes(value) ? value : fallback;
}

// Позиции счёта → PurchaseItem (src/data/purchases.ts). id генерируем здесь
// же и запоминаем в снимке: по ним фронт потом находит СВОИ строки в
// карточке, когда закупщица сопоставляет их со сметой или откатывает
// ошибочную запись — искать по имени было бы ненадёжно (у поставщика может
// быть две одинаковые строки в разных счетах).
function toPurchaseItems(items) {
  return (Array.isArray(items) ? items : []).map((i) => ({
    id: randomUUID(),
    sourceMaterialId: null,
    name: i.name,
    unit: i.unit ?? '',
    quantity: i.quantity ?? null,
    price: i.price ?? null,
    note: '',
    unitPrice: null,
  }));
}

// Возвращает и новый список файлов, и признак "файл добавлен именно этой
// записью" — при откате трогать чужой, уже лежавший в карточке файл нельзя.
function withFile(files, sourceFile) {
  const current = Array.isArray(files) ? files : [];
  if (!sourceFile || current.some((f) => f && f.url === sourceFile.url)) return { files: current, added: false };
  return { files: [...current, { url: sourceFile.url, fileName: sourceFile.fileName }], added: true };
}

// Возвращает снимок применения (то, что кладётся в extraction.applied) —
// его хватает, чтобы откатить запись ровно в том объёме, в каком она была
// сделана, не трогая то, что закупщица успела добавить руками.
// emailId — письмо, из которого счёт распознан (source_email_id у КП).
// Заголовок строки КП. Тема письма одна на все его счета, поэтому когда
// счетов несколько, к теме добавляется имя файла — иначе в сравнении цен
// две неразличимые строки "Re: Грильято 100х100" (владелец, 2026-09-14:
// "я как раз сравниваю альтернативные материалы"). Тот же формат, что на
// клиенте (quoteTitle в SupplierCorrespondenceTab.tsx) — ручной и
// автоматический путь не должны расходиться.
export function quoteTitle(subject, fileName, severalInvoices) {
  const base = String(subject ?? '').trim();
  const file = String(fileName ?? '')
    .replace(/\.[^.]+$/, '')
    .trim();
  if (!severalInvoices || !file) return base || file || 'Счёт без темы';
  return base ? `${base} — ${file}` : file;
}

// Сопоставление строк счёта с позициями ведомости запроса. Возвращает НОВЫЙ
// список позиций; при любой осечке — исходный, без привязки: счёт важнее
// сопоставления, и терять распознанные цены из-за недоступной модели нельзя.
async function withMatches(items, { offerId, supplierName }) {
  if (items.length === 0) return items;
  try {
    const offers = await restGet(`supplier_research_offers?id=eq.${offerId}&select=request_id`);
    const requestId = offers[0]?.request_id;
    if (!requestId) return items;
    const requests = await restGet(`supplier_research_requests?id=eq.${requestId}&select=items`);
    const positions = Array.isArray(requests[0]?.items) ? requests[0].items : [];
    if (positions.length === 0) return items;

    const matches = await suggestMatches({
      positions: positions.map((p) => ({
        id: p.id,
        name: p.name,
        quantity: p.quantity,
        unit: p.unit,
        consumption: p.consumption ?? null,
        consumptionUnit: p.consumptionUnit ?? null,
        note: p.note ?? '',
      })),
      lines: items.map((i) => ({
        id: i.id,
        supplier: supplierName ?? '',
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        price: i.price,
      })),
    });

    const byLine = new Map(matches.map((m) => [m.lineId, m]));
    return items.map((item) => {
      const m = byLine.get(item.id);
      if (!m) return item;
      return {
        ...item,
        sourceMaterialId: m.positionId,
        unitPrice: m.unitPrice,
        // 'none' — строка вообще не про наши позиции (колеровка, образцы):
        // вида соответствия у неё нет, и выдумывать его не надо.
        matchKind: m.kind === 'none' ? undefined : m.kind,
        matchNote: m.note || '',
        matchConfidence: m.confidence,
      };
    });
  } catch (err) {
    console.error('Автосопоставление позиций счёта не удалось (счёт всё равно записан):', err instanceof Error ? err.message : err);
    return items;
  }
}

export async function applyRecognizedInvoice({ emailId, offerId, orderId, subject, recognized, sourceFile, title, supplierName }) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY не заданы — некуда записывать распознанный счёт');
  }

  const newItems = await withMatches(toPurchaseItems(recognized.items), { offerId, supplierName });
  const itemIds = newItems.map((i) => i.id);

  // Дополнительная заявка (supplier_orders) ведёт свою переписку и свои
  // цены — владелец, 2026-09-03: "1 заявка на поставку — одна ветка".
  // Письмо всегда лежит в своём треде, поэтому цель определяется полем
  // order_id самого письма, а не тем, какой тред сейчас открыт на экране
  // (на сервере экрана нет).
  if (orderId) {
    const rows = await restGet(`supplier_orders?id=eq.${orderId}&select=price,currency,items,files,communication_status`);
    const order = rows[0];
    if (!order) throw new Error(`Заявка ${orderId} не найдена — счёт записывать некуда`);
    const orderFiles = withFile(order.files, sourceFile);

    await restPatch(`supplier_orders?id=eq.${orderId}`, {
      price: recognized.price ?? order.price,
      currency: normalizedCurrency(recognized.currency, order.currency),
      items: [...(order.items ?? []), ...newItems],
      files: orderFiles.files,
      communication_status: String(order.communication_status || '').trim() ? order.communication_status : 'Получили КП',
    });

    return {
      target: 'order',
      targetId: orderId,
      quoteId: null,
      itemIds,
      fileUrl: sourceFile?.url ?? null,
      fileAdded: orderFiles.added,
      previous: { price: order.price, currency: order.currency, inn: null },
      appliedAt: new Date().toISOString(),
    };
  }

  const rows = await restGet(`supplier_research_offers?id=eq.${offerId}&select=price,currency,items,files,inn`);
  const offer = rows[0];
  if (!offer) throw new Error(`Предложение ${offerId} не найдено — счёт записывать некуда`);

  const currency = normalizedCurrency(recognized.currency, offer.currency);
  const offerFiles = withFile(offer.files, sourceFile);
  await restPatch(`supplier_research_offers?id=eq.${offerId}`, {
    price: recognized.price ?? offer.price,
    currency,
    items: [...(offer.items ?? []), ...newItems],
    files: offerFiles.files,
    // Уже сохранённый ИНН не затираем: счёт без ИНН (модель не нашла) — не
    // повод терять реквизиты, полученные раньше.
    inn: recognized.supplierInn ?? offer.inn,
  });

  // Отдельная строка КП на каждый распознанный счёт — иначе несколько
  // счетов от одного поставщика в одной ветке схлопываются в карточку, где
  // цена от последнего, а позиции от всех сразу (разбор 2026-09-11).
  const quote = await restInsert('supplier_offer_quotes', {
    offer_id: offerId,
    title: title || subject || 'Счёт без темы',
    price: recognized.price ?? 0,
    currency,
    items: newItems,
    files: sourceFile ? [{ url: sourceFile.url, fileName: sourceFile.fileName }] : [],
    // Пометку "аналог" ставит человек: по данным счёта отличить аналог от
    // того, что просили, нельзя (реальный случай с профилем h30 вместо h40,
    // см. data/supplierQuotes.ts).
    is_alternative: false,
    alternative_note: '',
    source_email_id: emailId ?? null,
    // Условия поставки из счёта и текста письма (шаг 6 плана закупок):
    // доставка, срок, предоплата, НДС. null — в тексте их не нашли.
    terms: recognized.terms ?? null,
  });

  return {
    target: 'offer',
    targetId: offerId,
    quoteId: quote?.id ?? null,
    itemIds,
    fileUrl: sourceFile?.url ?? null,
    fileAdded: offerFiles.added,
    previous: { price: offer.price, currency: offer.currency, inn: offer.inn },
    appliedAt: new Date().toISOString(),
  };
}
