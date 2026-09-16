import type { QuoteTerms } from './supplierQuotes';
import type { DocumentFile } from './contractorDocuments';
import type { EmailSendStatus } from './emailSendStatus';

// Результат распознавания счёта/КП во вложении письма (Claude Haiku 4.5,
// см. api/_invoiceRecognition.js) — и от автоматического срабатывания на
// входящих, и от ручной кнопки "Распознать данные автоматически". null —
// либо распознавание ещё не запускалось, либо вложение признано не счётом
// (в этом случае оно вообще не сохраняется — не засорять письма пустыми
// "не подошло"). status: 'pending' — Альмире есть что подтвердить,
// 'confirmed'/'dismissed' — уже разобрано (карточка сворачивается).
export interface EmailExtractionItem {
  name: string;
  quantity: number | null;
  unit: string;
  price: number | null;
  // Тара строки: сколько и чего в ОДНОЙ единице `unit` (шаг 7 плана
  // закупок, см. PurchaseItem.packQty). Заполняется распознаванием, только
  // если объём фасовки прямо написан в документе.
  packQty?: number | null;
  packUnit?: string;
}

// sourceFile — какое именно вложение распознано (нужно, чтобы при
// подтверждении прикрепить сам файл счёта к карточке предложения, не
// только цифры из него) — null у записей, сделанных до 2026-09-03
// (в момент, когда поле появилось), но новые всегда его заполняют.
// Снимок того, ЧТО именно автоматическая запись счёта изменила в базе —
// пишется сервером (api/_invoiceApply.js) в момент записи. Нужен для двух
// вещей: сверки позиций со сметой уже ПОСЛЕ записи (по itemIds фронт
// находит в карточке строки именно этого счёта) и отката, если модель
// приняла за счёт что-то другое — тогда снимок позволяет вернуть ровно то,
// что было, не задев данные, добавленные человеком.
export interface EmailExtractionApplied {
  target: 'offer' | 'order';
  targetId: string;
  // Строка supplier_offer_quotes, созданная под этот счёт (у заявок КП не
  // заводятся — там null, см. _invoiceApply.js).
  quoteId: string | null;
  // id позиций (PurchaseItem.id), добавленных в карточку из этого счёта.
  itemIds: string[];
  // Файл счёта, если он был ПРИКРЕПЛЁН этой записью (fileAdded=false —
  // файл в карточке уже лежал, откат его не трогает).
  fileUrl: string | null;
  fileAdded: boolean;
  previous: { price: number | null; currency: string | null; inn: string | null };
  appliedAt: string;
}

// Один распознанный счёт письма. Владелец, 2026-09-14: "в письме два счета,
// а распознался и записался в базу только 1. Хотя я как раз сравниваю
// альтернативные материалы" — реальное письмо Авангарда с двумя счетами
// (алюминий и оцинковка) на один и тот же потолок. До этой правки письмо
// могло нести ровно один счёт: поля price/items/sourceFile лежали прямо в
// EmailExtraction, второй счёт не находился вовсе.
//
// Сейчас счетов может быть несколько, но форма хранения осталась
// обратно совместимой: ПЕРВЫЙ счёт по-прежнему лежит в корне
// EmailExtraction (старые записи и старый код продолжают работать как
// работали), остальные — в additionalInvoices. Не читать эти поля
// напрямую: весь интерфейс работает через extractionInvoices() ниже,
// который приводит обе формы к одному списку.
export interface EmailExtractionInvoice {
  price: number | null;
  currency: string | null;
  items: EmailExtractionItem[];
  supplierInn: string | null;
  sourceFile: { url: string; fileName: string } | null;
  // Другие вложения письма, оказавшиеся ТЕМ ЖЕ счётом: поставщики
  // регулярно шлют один документ двумя файлами (реальный комплект
  // КраскиТорга — "Счет на оплату № 84664" и "Заказ клиента № 84664":
  // один номер, одна сумма, одни позиции). Отдельным КП такой файл не
  // становится — иначе задвоились бы и позиции, и сумма в сравнении цен,
  // — но в переписке помечается наравне с оригиналом, чтобы не выглядел
  // потерянным (владелец, 2026-09-14: "и вот еще два счета не распознаны").
  duplicateFiles?: { url: string; fileName: string }[];
  // Снимок записи ИМЕННО этого счёта в базу (см. EmailExtractionApplied).
  // У первого счёта берётся из корня extraction — там он лежал всегда.
  applied: EmailExtractionApplied | null;
  // Условия поставки, распознанные вместе со счётом (шаг 6 плана закупок).
  // В базу они и так уезжают в supplier_offer_quotes.terms; здесь они нужны
  // форме сопоставления — из них берётся, с НДС в счёте цены или без (шаг 7).
  // Отсутствуют у записей, сделанных до появления условий.
  terms?: QuoteTerms | null;
  // Насколько модель уверена в распознанном (0-1, шаг 10 плана закупок).
  // null или отсутствует — у записей до 2026-09-16 (уверенность тогда не
  // спрашивали); такие счета записывались без порога, как и раньше.
  confidence?: number | null;
  // Откуда взяты цифры: 'attachment' — из вложенного счёта (и до шага 10
  // других вариантов не было, поэтому отсутствие поля читается так же),
  // 'email_body' — из текста самого письма. Разница видна закупщице: цену,
  // набранную менеджером в письме, стоит перепроверить внимательнее, чем
  // ту же цену в подписанном счёте.
  sourceKind?: 'attachment' | 'email_body';
}

export interface EmailExtraction {
  // 'none' — распознавание отработало и счёта во вложениях НЕ нашло; в
  // attempts/skipped лежит протокол (что пробовали, что отсеяли и почему).
  // Появился 2026-09-14: до него неудача не оставляла в письме ничего, и
  // вопрос "почему обычный счёт не распознался" нельзя было закрыть
  // запросом к базе. В интерфейсе переписки такой статус ничего не рисует —
  // он только для разбора.
  status: 'pending' | 'confirmed' | 'dismissed' | 'none';
  // Владелец, 2026-09-12: "мне нужно автоматическое распознавание счетов и
  // запись в базу ещё до открытия письма нами вручную" — true означает, что
  // status:'confirmed' поставил не человек кнопкой, а сервер при приёме
  // письма. Отличать нужно: у автозаписи в переписке своя карточка (сверить
  // позиции / откатить), у ручной — прежняя пометка "Данные в базе".
  appliedAutomatically?: boolean;
  applied?: EmailExtractionApplied | null;
  isInvoice: boolean;
  price: number | null;
  currency: string | null;
  items: EmailExtractionItem[];
  // ИНН поставщика, выставившего счёт (не наш, не покупателя — см. промпт
  // в api/_invoiceRecognition.js, там про это отдельно). null — в счёте не
  // нашёлся, или модель не смогла уверенно отличить его от ИНН покупателя.
  // Проверен на контрольный разряд ещё на сервере, до записи сюда.
  supplierInn: string | null;
  sourceFile: { url: string; fileName: string } | null;
  recognizedAt: string;
  // Второй и последующие счета того же письма (первый — в полях выше).
  // Пусто/нет поля — в письме один счёт, как было до 2026-09-14.
  additionalInvoices?: EmailExtractionInvoice[];
  // Копии ПЕРВОГО счёта другими файлами (см. EmailExtractionInvoice).
  duplicateFiles?: { url: string; fileName: string }[];
  // См. одноимённые поля EmailExtractionInvoice — у ПЕРВОГО счёта они, как
  // и всё остальное, лежат прямо в корне.
  confidence?: number | null;
  sourceKind?: 'attachment' | 'email_body';
  // Диагностика неудачи (заполняется только при status:'none').
  attempts?: { fileName: string; outcome: string }[];
  skipped?: { fileName: string; reason: string }[];
  error?: string;
}

// Все счета письма одним списком — единственный способ читать
// распознавание в интерфейсе. Скрывает то, что первый счёт хранится в
// корне extraction, а остальные в additionalInvoices (см. выше), поэтому
// письмо с одним счётом и письмо с тремя обрабатываются одинаковым кодом.
// status:'none' — счёта не нашли вовсе, там в полях только протокол
// неудачи, счётом его считать нельзя (иначе в переписке нарисовался бы
// пустой "счёт без суммы").
export function extractionInvoices(extraction: EmailExtraction | null | undefined): EmailExtractionInvoice[] {
  if (!extraction || extraction.status === 'none' || !extraction.isInvoice) return [];
  // Короткоживущая форма записи (прод 2026-09-14, 08:39–…): при двух и
  // более счетах сервер клал в applied МАССИВ снимков вместо объекта.
  // Письма, принятые в этом окне, иначе уронили бы карточку на
  // applied.itemIds.indexOf.
  const rootApplied = Array.isArray(extraction.applied)
    ? ((extraction.applied[0] as EmailExtractionApplied | undefined) ?? null)
    : (extraction.applied ?? null);
  const first: EmailExtractionInvoice = {
    price: extraction.price,
    currency: extraction.currency,
    items: extraction.items ?? [],
    supplierInn: extraction.supplierInn,
    sourceFile: extraction.sourceFile,
    duplicateFiles: extraction.duplicateFiles ?? [],
    applied: rootApplied,
    confidence: extraction.confidence ?? null,
    sourceKind: extraction.sourceKind ?? 'attachment',
  };
  return [first, ...(extraction.additionalInvoices ?? [])];
}

// Одно письмо в переписке по конкретному предложению Ресерча поставщиков —
// см. data/supplierResearch.ts (supplierOfferEmailAddress) и
// api/purchase-send-email.js/purchase-email-webhook.js (несмотря на имя,
// обрабатывают оба направления переписки — закупки и Ресерч, см. комментарий
// в самих файлах). Один в один PurchaseEmail (data/purchaseEmails.ts),
// просто своя таблица — переписка по предложению до выбора поставщика и
// переписка по уже оформленной закупке концептуально разные вещи (RFQ vs
// твёрдый заказ), поэтому не смешиваем в одной таблице.
export interface SupplierOfferEmail {
  id: string;
  offerId: string;
  // Владелец, 2026-09-03: "1 заявка на поставку — одна ветка" — null значит
  // письмо принадлежит "основной" переписке поставщика (той, что была
  // всегда, живёт прямо на offer), непустое значение — конкретной
  // дополнительной заявке (SupplierOrder). offerId всё равно заполнен и
  // здесь — общий счётчик непрочитанных по поставщику (countUnreadSupplierEmails,
  // группировка в SupplierCorrespondenceTab) считает по offerId независимо
  // от того, в какой конкретно ветке письмо.
  orderId: string | null;
  direction: 'in' | 'out';
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  files: DocumentFile[];
  resendMessageId: string | null;
  // Когда письмо отмечено прочитанным — только для direction='in' (см.
  // markSupplierOfferEmailsRead в lib/supplierOfferEmailsApi.ts), у
  // исходящих всегда null. Непрочитанные входящие — вкладка "Переписка"
  // (src/pages/Suppliers.tsx) и колокольчик уведомлений.
  readAt: string | null;
  extraction: EmailExtraction | null;
  // Кто отправил письмо (владелец, 2026-09-12 — учёт работы с письмами по
  // сотрудникам, см. Metrics.tsx). Только у исходящих: у входящих автор —
  // сам поставщик, он не наш профиль. Заполняется сервером (api/purchase-
  // send-email.js — по реально вошедшему пользователю из токена, не по
  // присланному клиентом имени) и обработчиком массовой рассылки (берёт
  // автора самого задания). null — письмо до появления колонки, кроме
  // разобранных бэкфиллом по подписи в теле (см. журнал 2026-09-12).
  sentByProfileId: string | null;
  sentByName: string | null;
  // Ушло ли письмо на самом деле (см. data/emailSendStatus.ts). У входящих
  // всегда 'sent' — колонка общая на обе стороны переписки, но смысл имеет
  // только у исходящих. sendError — причина, по которой письмо ждёт очереди
  // или не ушло совсем.
  sendStatus: EmailSendStatus;
  sendError: string | null;
  // Судьба отправленного письма по данным почтового сервера (шаг 9 плана
  // закупок, события Resend — api/_emailEvents.js). Только у исходящих.
  // null в deliveredAt у свежего письма — это «ещё не знаем», а не «не
  // доставлено»: событие приходит через секунды после отправки, а у писем
  // до 2026-09-16 его не было вовсе.
  deliveredAt: string | null;
  // Открытие письма Resend видит только при включённом open tracking на
  // домене; если он выключен, поле всегда null — и это не означает, что
  // письмо не читали.
  openedAt: string | null;
  // Почтовый сервер вернул письмо. bounceReason — тип и текст отказа как их
  // прислал Resend. Постоянный отказ дополнительно помечает сам адрес
  // (SupplierOffer.emailInvalidAt).
  bouncedAt: string | null;
  bounceReason: string | null;
  // Получатель нажал «это спам». Компания при этом уходит в стоп-лист.
  complainedAt: string | null;
  // Настоящий заголовок Message-ID письма — по нему ответ поставщика
  // привязывается к треду, если он пришёл не на plus-адрес. НЕ равен
  // resendMessageId, см. разбор в api/_emailEvents.js.
  messageIdHeader: string | null;
  createdAt: string;
}

// Владелец, 2026-09-06: "карточку организации... только к первому письму" —
// "первое" здесь про поставщика (offerId) целиком, не про конкретный тред:
// у одного поставщика может быть несколько заявок/тредов (см. orderId выше,
// "1 заявка на поставку — одна ветка"), но карточку с реквизитами нужно
// отправить один раз за всё время знакомства, не на каждую новую заявку.
// emails — весь список писем ЭТОГО поставщика по всем его тредам разом (тот
// же проп, что уже передаётся в EmailThread/BulkSendModal).
export function isFirstOutgoingToOffer(emails: SupplierOfferEmail[], offerId: string): boolean {
  return !emails.some((e) => e.offerId === offerId && e.direction === 'out');
}

export interface SupplierOfferEmailRow {
  id: string;
  offer_id: string;
  order_id: string | null;
  direction: string;
  from_address: string;
  to_address: string;
  subject: string | null;
  body: string | null;
  files: DocumentFile[] | null;
  resend_message_id: string | null;
  read_at: string | null;
  extraction: EmailExtraction | null;
  sent_by_profile_id: string | null;
  sent_by_name: string | null;
  send_status: string | null;
  send_error: string | null;
  delivered_at?: string | null;
  opened_at?: string | null;
  bounced_at?: string | null;
  bounce_reason?: string | null;
  complained_at?: string | null;
  message_id_header?: string | null;
  created_at: string;
  // Мягкое удаление (миграция 20260915-soft-delete-supplier-data.sql):
  // строка жива, но скрыта из интерфейса. NULL у всего активного.
  deleted_at?: string | null;
}
