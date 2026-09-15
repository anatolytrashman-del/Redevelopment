import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, Paperclip, Send, FileText, Save, ChevronDown, ChevronUp, Reply, FileSearch, CheckCircle2, Eye, FileSpreadsheet, X, Plus, Users, Clock, AlertTriangle, Bot } from 'lucide-react';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { cn } from '../../lib/cn';
import type { SupplierRequest, SupplierOffer } from '../../data/supplierResearch';
import { RiskBadge } from './RiskBadge';
import type { SupplierReliability } from '../../data/supplierReliability';
import { checkSupplierReliability } from '../../lib/supplierReliabilityApi';
import { supplierOfferEmailAddress, countryFlag, SUPPLIER_COUNTRIES } from '../../data/supplierResearch';
import { updateSupplierOffer } from '../../lib/supplierResearchApi';
import type { SupplierOrder } from '../../data/supplierOrders';
import { insertSupplierOrder, updateSupplierOrder } from '../../lib/supplierOrdersApi';
import type {
  SupplierOfferEmail,
  EmailExtractionItem,
  EmailExtraction,
  EmailExtractionApplied,
  EmailExtractionInvoice,
} from '../../data/supplierOfferEmails';
import { isFirstOutgoingToOffer, extractionInvoices } from '../../data/supplierOfferEmails';
import { emailSendStatusLabel } from '../../data/emailSendStatus';
import { sendSupplierOfferEmail, setSupplierOfferEmailExtractionStatus } from '../../lib/supplierOfferEmailsApi';
import type { LegalEntity } from '../../data/legalEntities';
import { resolveRequestLegalEntity, fetchDocumentFileAsAttachment, fileToAttachment } from '../../lib/legalEntityAttachment';
import type { EmailTemplate } from '../../data/emailTemplates';
import { renderEmailTemplate, DEFAULT_MATERIALS_SUBJECT } from '../../lib/emailTemplates';
import { TemplateFormModal, TemplateManagerModal } from './EmailTemplates';
import type { MaterialLedger } from '../../data/materialLedgers';
import { MaterialLedgerModal } from './MaterialLedgerModal';
import type { LedgerAttachment } from '../../lib/materialLedgerXlsx';
import { getCurrentProfile } from '../../lib/accessProfile';
import { logActivity } from '../../lib/activityLogApi';
import { DocumentPreviewModal, isPreviewable, type PreviewFile } from '../documents/DocumentPreviewModal';
import { currencies, type Currency } from '../../data/transactions';
import { PURCHASE_ITEM_MATCH_KIND_LABELS, looksLikeDeliveryItem, type PurchaseItem, type PurchaseItemMatchKind } from '../../data/purchases';
import type { SupplierQuote } from '../../data/supplierQuotes';
import { insertSupplierQuote, updateSupplierQuoteItems, deleteSupplierQuote } from '../../lib/supplierQuotesApi';
import type { EmailAutoReplyLogEntry } from '../../data/emailAutoReply';
import { AUTO_REPLY_SENDER_NAME } from '../../data/emailAutoReply';
import { markAutoReplyReviewed } from '../../lib/emailAutoReplyApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Владелец, 2026-09-03: "обязательно нужно загружать вложения с
// возможностью предпросмотра" — для картинок показываем миниатюру прямо в
// ленте (клик открывает оригинал в новой вкладке), для остального (PDF,
// счета, спецификации) остаётся обычная ссылка — открывается в новой
// вкладке, где браузер сам умеет превью PDF.
function isImageFile(fileName: string): boolean {
  return /\.(png|jpe?g|gif|webp|heic|heif|bmp|svg)$/i.test(fileName);
}

// Владелец, 2026-09-03, после живого теста: "текст, скрытый под спойлер в
// почтовом клиенте (в нашем случае On ... wrote: > ...) нужно скрывать под
// спойлер и выводить только ответ" — реальные ответы поставщиков приходят
// с процитированным предыдущим письмом внизу (стандартное поведение любого
// почтового клиента), это раздувает ленту. Эвристика best-effort (нельзя
// знать заранее локаль/формат клиента отправителя): ищем первую строку,
// которая либо начинается с ">" (стандартный маркер цитаты, кросс-клиентно),
// либо похожа на преамбулу вида "On ... wrote:"/"...писал(а):" — всё начиная
// с неё сворачивается. Не находим — весь текст видимый, ничего не прячем.
const QUOTE_PREAMBLE_RE = /^(On .+wrote:|.*писал\(а\):)\s*$/i;

function splitQuotedReply(body: string): { visible: string; quoted: string | null } {
  const lines = body.split('\n');
  let splitIndex = -1;
  let foundViaQuoteMarker = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('>')) {
      splitIndex = i;
      foundViaQuoteMarker = true;
      break;
    }
    if (QUOTE_PREAMBLE_RE.test(trimmed)) {
      splitIndex = i;
      break;
    }
  }
  if (splitIndex === -1) return { visible: body, quoted: null };

  // Преамбула вида "On ... wrote:" часто переносится почтовым клиентом на
  // несколько строк (Gmail рвёт длинные строки ~76 символов — реальный
  // пример владельца: "On Thu... <email>" и "wrote:" оказались на РАЗНЫХ
  // строках) — если границу нашли по ">", расширяем её назад через любые
  // непустые строки прямо перед ней, похожие на фрагмент такой преамбулы.
  // Идём только назад ОТ уже найденного ">" (не ищем "wrote:" в письме без
  // единой цитаты вообще) — иначе случайное "On the invoice..." в начале
  // обычного письма без квоты ложно свернулось бы целиком.
  if (foundViaQuoteMarker) {
    for (let i = splitIndex - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed === '') continue;
      if (/wrote:\s*$/i.test(trimmed) || /писал\(а\):\s*$/i.test(trimmed) || /^on\s/i.test(trimmed)) {
        splitIndex = i;
        continue;
      }
      break;
    }
  }

  const visible = lines.slice(0, splitIndex).join('\n').trimEnd();
  const quoted = lines.slice(splitIndex).join('\n');
  return { visible, quoted: quoted.trim() ? quoted : null };
}

// Владелец, тем же сообщением: "нужна возможность отвечать на это письмо,
// чтобы сохранялся и заголовок, и вся предыдущая история" — "Ответить" на
// конкретном письме треда подставляет в форму тему с "Re:" (если её там ещё
// нет) и цитату этого письма (как в обычном email-клиенте, ">" на каждую
// строку + преамбула с датой/отправителем).
//
// Владелец, 2026-09-10: реальный баг предыдущей версии — цитата
// ВСТАВЛЯЛАСЬ прямо в поле "Сообщение" (через window.confirm "Заменить
// черновик цитатой?"), из-за чего повторный клик на "Ответить" цитировал
// уже процитированный текст — видимого изменения не было, выглядело как
// "ничего не добавляется". Теперь цитата — отдельное состояние
// (quotedReplyText, см. ниже), не смешивается с тем, что печатает
// пользователь: поле "Сообщение" остаётся только под собственный ответ
// (как верхняя часть письма в обычном email-клиенте), а цитата показывается
// отдельным свёрнутым блоком под ним ("под катом") и подклеивается к телу
// только в момент отправки (см. handleSend). Больше никакого confirm().
function buildQuotedReply(e: SupplierOfferEmail): { subject: string; quoted: string } {
  const subject = /^re:/i.test(e.subject.trim()) ? e.subject : `Re: ${e.subject}`;
  const preamble = `${new Date(e.createdAt).toLocaleString('ru-RU')}, ${e.fromAddress} писал(а):`;
  const quotedLines = e.body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return { subject, quoted: `${preamble}\n${quotedLines}` };
}

// Распознавание счёта/КП из вложения (владелец, 2026-09-03: "давай подумаем,
// как сделать так, чтобы это КП было потом удобно перенести в карточку
// подрядчика... даже сумму и позиции из счета можем распознавать
// автоматически" → "делай на Haiku 4.5"). Раньше рядом была ещё и ручная
// кнопка "Распознать данные автоматически" в предпросмотре вложения — тем
// же днём убрана ("Убирай эту кнопку, раз система сама распознает данные"):
// автоматика (api/purchase-email-webhook.js, по числу страниц вложения +
// классификация моделью) срабатывает на каждом входящем письме сама, кладёт
// результат в email.extraction (status:'pending') — здесь только
// подтверждение/отклонение уже готового результата, без ручного триггера.
function isValidCurrency(value: string | null): value is Currency {
  return !!value && (currencies as readonly string[]).includes(value);
}

function pluralPositions(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'позиция';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'позиции';
  return 'позиций';
}

// Пишет распознанные цену/валюту/позиции в карточку предложения и, если
// известен источник (sourceFile — сам файл, который распознавали),
// прикрепляет его к тем же файлам предложения — владелец, 2026-09-03:
// "давай верстать таблицу" (вместо текстовой простыни в "Требованиях",
// см. историю в EMAIL_CORRESPONDENCE_PLAN.md) + "давай подкреплять в
// карточку файл КП из письма". Позиции ДОБАВЛЯЮТСЯ к уже существующим
// (не затирают то, что уже было в карточке вручную), файл — тоже, с
// дедупликацией по url (повторное подтверждение того же письма не
// плодит копии). currency из распознавания может не совпасть ни с одним
// известным значением (модели явно запрещено гадать, возвращает null,
// если не уверена) — тогда валюту карточки не трогаем.
// Владелец, 2026-09-04: сопоставление позиции счёта с материалом сметы —
// теперь пара (materialId, unitPrice), не просто materialId. materialId —
// какой материал сметы (EstimateMaterial.id) соответствует этой строке;
// unitPrice — цена за ОДНУ единицу измерения ЭТОГО материала (тот же unit,
// что в смете), введённая/подтверждённая вручную (см. форму сопоставления
// в footer предпросмотра ниже, computeUnitPriceGuess). Без сопоставления —
// sourceMaterialId остаётся null (позиция разовая, вне сметы, или ещё не
// сопоставлена), без unitPrice — позиция сопоставлена, но пока не участвует
// в сравнении цен (нечего сравнивать, пока Альмира не указала цену за
// единицу сметы).
export interface MaterialMatch {
  materialId: string;
  unitPrice: string;
  // Владелец, 2026-09-15: вид соответствия, пометка и ссылка на карточку
  // товара (см. PurchaseItem.matchKind/matchNote/productUrl) — заполняются
  // здесь же, при сопоставлении, потому что только человек знает, аналог
  // это или ровно то, что просили. 'delivery' — строка не материал вовсе.
  kind: PurchaseItemMatchKind;
  note: string;
  productUrl: string;
}

const emptyMatch = (materialId = ''): MaterialMatch => ({ materialId, unitPrice: '', kind: 'exact', note: '', productUrl: '' });

// Что записать в PurchaseItem из формы сопоставления. Строка «доставка» —
// без материала сметы (её некуда сопоставлять), но с видом, чтобы сравнение
// цен отнесло её к доставке, а не потеряло.
function matchFields(match: MaterialMatch | undefined): Pick<PurchaseItem, 'sourceMaterialId' | 'unitPrice' | 'matchKind' | 'matchNote' | 'productUrl'> {
  const unitPrice = match?.unitPrice ? Number(match.unitPrice) : NaN;
  const kind: PurchaseItemMatchKind | undefined = match?.kind === 'delivery' ? 'delivery' : match?.materialId ? match.kind : undefined;
  return {
    sourceMaterialId: kind === 'delivery' ? null : match?.materialId || null,
    unitPrice: kind && kind !== 'delivery' && Number.isFinite(unitPrice) ? unitPrice : null,
    matchKind: kind,
    matchNote: match?.note.trim() || undefined,
    productUrl: match?.productUrl.trim() || undefined,
  };
}

// "Краска идёт в литрах, а поставщик выставляет количество банок по X
// литров... надо пересчитывать на литр, а не в целом" — raw price/quantity
// со счёта считаются в ТАРЕ ПОСТАВЩИКА (банки, упаковки), а не в единицах
// сметы, поэтому голое price/quantity доверенно только когда unit счёта
// совпадает с unit материала сметы буквально (тогда 1 "единица" счёта и
// правда 1 единица сметы) — иначе подсказку не даём вовсе, пусть Альмира
// посчитает сама (банка 5л/10л — знает только она, не счёт).
function computeUnitPriceGuess(
  it: EmailExtractionItem,
  materialId: string,
  allMaterials: { item: PurchaseItem; context: string }[],
): string {
  if (it.price == null || !it.quantity) return '';
  const material = allMaterials.find((m) => m.item.sourceMaterialId === materialId);
  if (!material) return '';
  const sameUnit = material.item.unit && it.unit && material.item.unit.trim().toLowerCase() === it.unit.trim().toLowerCase();
  if (!sameUnit) return '';
  return String(Math.round((it.price / it.quantity) * 100) / 100);
}

function extractionItemsToPurchaseItems(items: EmailExtractionItem[], materialMatches: Record<number, MaterialMatch>): PurchaseItem[] {
  return items.map((i, idx) => ({
    id: crypto.randomUUID(),
    name: i.name,
    unit: i.unit,
    quantity: i.quantity,
    price: i.price,
    note: '',
    ...matchFields(materialMatches[idx]),
  }));
}

// Каждое подтверждённое распознавание — отдельное КП (data/supplierQuotes.ts):
// поставщик может прислать в одну ветку несколько счетов, и раньше они
// схлопывались в карточку (цена от последнего, позиции от всех сразу).
// Карточка по-прежнему показывает последнее КП, но история вариантов теперь
// не теряется и видна в сравнении цен.
async function saveExtractionAsQuote(
  offerId: string,
  email: SupplierOfferEmail,
  extraction: { price: number | null },
  items: PurchaseItem[],
  sourceFile: { url: string; fileName: string } | null,
  currency: Currency,
  title: string,
): Promise<SupplierQuote> {
  return insertSupplierQuote({
    offerId,
    title,
    price: extraction.price ?? 0,
    currency,
    items,
    files: sourceFile ? [{ url: sourceFile.url, fileName: sourceFile.fileName }] : [],
    // Ставит человек: по данным счёта не отличить "аналог" от того, что
    // просили, — см. комментарий у SupplierQuote.isAlternative.
    isAlternative: false,
    alternativeNote: '',
    sourceEmailId: email.id,
  });
}

// Заголовок строки КП. Тема письма одна на все его счета, поэтому когда
// счетов несколько, к теме добавляется имя файла — иначе в сравнении цен
// две неразличимые строки "Re: Грильято 100х100" (владелец, 2026-09-14).
export function quoteTitle(subject: string, fileName: string | null, severalInvoices: boolean): string {
  const base = subject.trim();
  const file = (fileName ?? '').replace(/\.[^.]+$/, '').trim();
  if (!severalInvoices || !file) return base || file || 'Счёт без темы';
  return base ? `${base} — ${file}` : file;
}

// Кладёт снимок записи в КОНКРЕТНЫЙ счёт письма, не трогая остальные:
// первый счёт хранится в корне extraction, прочие — в additionalInvoices
// (см. extractionInvoices в data/supplierOfferEmails.ts). Счета сравниваем
// по url вложения — единственный их устойчивый признак.
function withInvoiceApplied(
  extraction: EmailExtraction,
  invoice: EmailExtractionInvoice,
  applied: EmailExtractionApplied | null,
): EmailExtraction {
  const url = invoice.sourceFile?.url ?? null;
  if ((extraction.sourceFile?.url ?? null) === url) return { ...extraction, applied };
  return {
    ...extraction,
    additionalInvoices: (extraction.additionalInvoices ?? []).map((inv) =>
      (inv.sourceFile?.url ?? null) === url ? { ...inv, applied } : inv,
    ),
  };
}

// Убирает ОДИН счёт из письма ("это не счёт"), сохраняя остальные: в
// письме с двумя счетами отклонение первого раньше пометило бы
// 'dismissed' всё письмо, вместе с настоящим вторым счётом. Оставшийся
// первый счёт переезжает в корень extraction — форма хранения та же, что
// у письма с одним счётом (см. extractionInvoices).
function withInvoiceRemoved(extraction: EmailExtraction, invoice: EmailExtractionInvoice): EmailExtraction {
  const url = invoice.sourceFile?.url ?? null;
  const rest = extractionInvoices(extraction).filter((inv) => (inv.sourceFile?.url ?? null) !== url);
  if (rest.length === 0) return { ...extraction, status: 'dismissed', applied: null, additionalInvoices: [] };
  const [first, ...others] = rest;
  return {
    ...extraction,
    status: rest.every((inv) => inv.applied) ? 'confirmed' : 'pending',
    price: first.price,
    currency: first.currency,
    items: first.items,
    supplierInn: first.supplierInn,
    sourceFile: first.sourceFile,
    applied: first.applied,
    additionalInvoices: others,
  };
}

// Счёт, который система уже САМА записала в базу при приёме письма
// (api/_invoiceApply.js) — владелец, 2026-09-12: "мне нужно автоматическое
// распознавание счетов и запись в базу ещё до открытия письма нами
// вручную". Отличается от обычного подтверждённого вручную тем, что
// человек его ещё не видел: по нему остаётся сверить позиции со сметой, а
// если модель ошиблась — откатить. Снимок applied пишет сервер; у записей
// старше этой правки его нет, поэтому проверяем именно его наличие, а не
// один флаг.
// 2026-09-14: у письма может быть несколько счетов (владелец: "в письме два
// счета, а распознался и записался в базу только 1... я как раз сравниваю
// альтернативные материалы"), поэтому "записан автоматически" — свойство
// КОНКРЕТНОГО счёта, а не письма целиком: один счёт письма может быть уже
// сверен со сметой, другой — откачен как ошибочный.
function autoApplied(e: SupplierOfferEmail, invoice: EmailExtractionInvoice): EmailExtractionApplied | null {
  const extraction = e.extraction;
  if (!extraction || extraction.status !== 'confirmed' || !extraction.appliedAutomatically) return null;
  return invoice.applied ?? null;
}

// Тот же файл, что распознан как счёт? Сравнение по url, а не по имени —
// поставщики шлют вложения с одинаковыми именами (реальный случай: два
// разных счёта, оба "Счет на оплату №2815 от 09.09.2026 (сФ).pdf", второй с
// суффиксом "(3)" от почтового клиента).
function invoiceOfFile(e: SupplierOfferEmail, fileUrl: string): EmailExtractionInvoice | null {
  return (
    extractionInvoices(e.extraction).find(
      (inv) => inv.sourceFile?.url === fileUrl || (inv.duplicateFiles ?? []).some((f) => f.url === fileUrl),
    ) ?? null
  );
}

// Это вложение — копия счёта, а не сам распознанный файл (см.
// duplicateFiles). Данные из него в базе, просто взяты из парного файла;
// в переписке поясняется подсказкой на пометке.
function duplicateOriginalName(invoice: EmailExtractionInvoice, fileUrl: string): string | null {
  if (invoice.sourceFile?.url === fileUrl) return null;
  return invoice.sourceFile?.fileName ?? null;
}

// Проставляет сопоставление со сметой позициям, которые автозапись уже
// положила в карточку (или в КП): по applied.itemIds понятно, какие именно
// строки пришли из ЭТОГО счёта — остальные (из других счетов или
// добавленные раньше) не трогаем. Индекс позиции счёта = индекс в itemIds,
// в том же порядке они и записывались (см. toPurchaseItems в
// api/_invoiceApply.js).
function withMaterialMatches(
  items: PurchaseItem[],
  applied: EmailExtractionApplied,
  materialMatches: Record<number, MaterialMatch>,
): PurchaseItem[] {
  return items.map((item) => {
    const idx = applied.itemIds.indexOf(item.id);
    if (idx === -1) return item;
    return { ...item, ...matchFields(materialMatches[idx]) };
  });
}

// Откат автозаписи — ровно в том объёме, в каком она была сделана:
// возвращаются прежние цена/валюта/ИНН, убираются добавленные ею позиции и
// файл (если файл прикрепила именно она — fileAdded). Всё, что закупщица
// успела добавить в карточку сама, остаётся на месте.
function revertAppliedOnOffer(offer: SupplierOffer, applied: EmailExtractionApplied): Promise<SupplierOffer> {
  return updateSupplierOffer(offer.id, {
    requestId: offer.requestId,
    name: offer.name,
    contact: offer.contact,
    contactMethod: offer.contactMethod,
    email: offer.email,
    managerName: offer.managerName,
    country: offer.country,
    websiteUrl: offer.websiteUrl,
    listingUrl: offer.listingUrl,
    contactSource: offer.contactSource,
    messengers: offer.messengers,
    catalogModelName: offer.catalogModelName,
    catalogModelPhoto: offer.catalogModelPhoto,
    price: applied.previous.price ?? 0,
    currency: isValidCurrency(applied.previous.currency) ? applied.previous.currency : offer.currency,
    items: offer.items.filter((i) => !applied.itemIds.includes(i.id)),
    files: applied.fileAdded && applied.fileUrl ? offer.files.filter((f) => f.url !== applied.fileUrl) : offer.files,
    verified: offer.verified,
    inn: applied.previous.inn,
  });
}

function revertAppliedOnOrder(order: SupplierOrder, applied: EmailExtractionApplied): Promise<SupplierOrder> {
  return updateSupplierOrder(order.id, {
    title: order.title,
    communicationStatus: order.communicationStatus,
    price: applied.previous.price ?? 0,
    currency: isValidCurrency(applied.previous.currency) ? applied.previous.currency : order.currency,
    deadline: order.deadline,
    requirements: order.requirements,
    items: order.items.filter((i) => !applied.itemIds.includes(i.id)),
    files: applied.fileAdded && applied.fileUrl ? order.files.filter((f) => f.url !== applied.fileUrl) : order.files,
  });
}

// newItems приходят ГОТОВЫМИ, а не собираются здесь из materialMatches:
// ровно эти же объекты (с теми же id) уходят и в строку КП, и в снимок
// applied.itemIds. Раньше карточка и КП собирали позиции двумя отдельными
// вызовами extractionItemsToPurchaseItems, то есть с разными
// crypto.randomUUID(), и связать строку КП с позициями карточки было
// нечем.
async function applyExtractionToOffer(
  offer: SupplierOffer,
  extraction: { price: number | null; currency: string | null; supplierInn?: string | null },
  sourceFile: { url: string; fileName: string } | null,
  newItems: PurchaseItem[],
): Promise<SupplierOffer> {
  const files =
    sourceFile && !offer.files.some((f) => f.url === sourceFile.url)
      ? [...offer.files, { url: sourceFile.url, fileName: sourceFile.fileName }]
      : offer.files;
  return updateSupplierOffer(offer.id, {
    requestId: offer.requestId,
    name: offer.name,
    contact: offer.contact,
    contactMethod: offer.contactMethod,
    email: offer.email,
    managerName: offer.managerName,
    country: offer.country,
    websiteUrl: offer.websiteUrl,
    listingUrl: offer.listingUrl,
    contactSource: offer.contactSource,
    messengers: offer.messengers,
    catalogModelName: offer.catalogModelName,
    catalogModelPhoto: offer.catalogModelPhoto,
    price: extraction.price ?? offer.price,
    currency: isValidCurrency(extraction.currency) ? extraction.currency : offer.currency,
    items: [...offer.items, ...newItems],
    files,
    verified: offer.verified,
    // Главный момент всей проверки благонадёжности: ИНН поставщика
    // попадает в карточку именно здесь — когда закупщица подтверждает
    // распознанный счёт. Владелец, 2026-09-11: "когда поставщик прислал
    // счет и нам стали известны реквизиты, запускать процесс верификации".
    // Уже сохранённый ИНН не затираем: если новый счёт пришёл без ИНН
    // (модель не нашла), прежний остаётся — это не повод терять данные.
    inn: extraction.supplierInn ?? offer.inn,
  });
}

// То же самое, но для дополнительной заявки (SupplierOrder), а не для
// "основной" переписки офера — владелец, 2026-09-03: "1 заявка на поставку —
// одна ветка". Письмо, из которого распознан счёт, всегда лежит в СВОЁМ
// треде (EmailThread показывает только письма текущей заявки), поэтому
// какую из двух функций звать, решает не e.orderId, а какая заявка сейчас
// открыта (order prop) — см. handleConfirmAutoExtraction.
async function applyExtractionToOrder(
  order: SupplierOrder,
  extraction: { price: number | null; currency: string | null },
  sourceFile: { url: string; fileName: string } | null,
  newItems: PurchaseItem[],
): Promise<SupplierOrder> {
  const files =
    sourceFile && !order.files.some((f) => f.url === sourceFile.url)
      ? [...order.files, { url: sourceFile.url, fileName: sourceFile.fileName }]
      : order.files;
  return updateSupplierOrder(order.id, {
    title: order.title,
    communicationStatus: order.communicationStatus.trim() ? order.communicationStatus : 'Получили КП',
    price: extraction.price ?? order.price,
    currency: isValidCurrency(extraction.currency) ? extraction.currency : order.currency,
    deadline: order.deadline,
    requirements: order.requirements,
    items: [...order.items, ...newItems],
    files,
  });
}

// Подсказка сопоставления — best-effort, не претендует на точность (краски
// разных брендов называются совершенно по-разному, автоматика по названию
// ненадёжна, владелец явно попросил ручную сверку). Просто заранее
// подставляет очевидное совпадение (точное имя или вхождение подстроки),
// чтобы не заставлять сопоставлять руками КАЖДУЮ позицию — Альмира всё
// равно видит и может поправить выбор в выпадающем списке.
function suggestMaterialMatch(name: string, allMaterials: { item: PurchaseItem; context: string }[]): string {
  const normalize = (s: string) => s.toLowerCase().replace(/["'«»]/g, '').trim();
  const target = normalize(name);
  if (!target) return '';
  const withId = allMaterials.filter((m) => m.item.sourceMaterialId);
  const exact = withId.find((m) => normalize(m.item.name) === target);
  if (exact) return exact.item.sourceMaterialId!;
  const partial = withId.find((m) => {
    const candidate = normalize(m.item.name);
    return candidate.includes(target) || target.includes(candidate);
  });
  return partial?.item.sourceMaterialId ?? '';
}

// Подпись письма — имя реально вошедшего сотрудника (getCurrentProfile), не
// захардкожено, иначе письма от Светланы или владельца подписывались бы
// чужим именем. Владелец, 2026-09-03: для его собственного профиля
// (display_name "Трэшмен" — рабочий никнейм, не имя) в письме нужно полное
// "Анатолий Трэшмен", при этом сам display_name в профиле трогать не
// просил ("в платформе имя не меняй") — подмена только на этом узком месте.
export function emailSignature(): string {
  const name = getCurrentProfile().displayName;
  return name === 'Трэшмен' ? 'Анатолий Трэшмен' : name;
}

// Черновик первого письма по умолчанию (до выбора сохранённого шаблона).
// Владелец, 2026-09-03, после серии правок темы/текста: "меняем шаблон
// письма" — тема больше не завязана на конкретную категорию запроса,
// текст — про ведомость материалов (та же правка, что добавила вложение
// ведомостей, см. MaterialLedgerModal).
//
// Владелец, 2026-09-03 (более ранняя правка, актуальна по-прежнему): "После
// отправки запроса не нужно выводить еще раз шаблон письма под перепиской,
// он уже будет не актуален" — вводный текст имеет смысл только для ПЕРВОГО
// письма в треде, hasHistory решает это.
// orderTitle — название текущей заявки (SupplierOrder.title), если письмо
// идёт не в "основной" переписке офера, а в дополнительной заявке (владелец,
// 2026-09-03: "1 заявка на поставку — одна ветка") — тема первого письма
// такой заявки по умолчанию берёт её название ("Окна"), а не общее
// "Закупка материалов".
function defaultSubject(hasHistory: boolean, orderTitle: string): string {
  return hasHistory ? '' : orderTitle || DEFAULT_MATERIALS_SUBJECT;
}

function defaultBody(hasHistory: boolean): string {
  if (hasHistory) return '';
  return `Добрый день.
Интересует поставка материалов. Список позиций и количество прикрепляю.

На каждую позицию готовы рассмотреть альтернативы.

Планируем оплачивать со счета юрлица. Просьба прислать коммерческое предложение/счет.

С уважением,
${emailSignature()}`;
}

// Лента писем + форма ответа — общий компонент для полноэкранной вкладки
// "Переписка" и для OfferEmailModal (карточка отдельного предложения), см.
// EMAIL_CORRESPONDENCE_PLAN.md, этап 2: "вынести разметку ленты в общий
// компонент, чтобы не было двух копий". Данные (emails) и их обновление —
// снаружи (в Suppliers.tsx, единый источник правды на всю страницу), сама
// отправка — здесь, единственное место в коде, которое реально шлёт письмо
// по предложению.
export function EmailThread({
  offer,
  order,
  request,
  requests,
  emails,
  templates,
  ledgers,
  allMaterials,
  legalEntities,
  onEmailSent,
  onTemplateSaved,
  onLedgersChange,
  onOfferUpdated,
  onReliabilityChecked,
  onOrderUpdated,
  onEmailUpdated,
  onQuotesChange,
  pendingAutoReplies,
  onAutoReplyReviewed,
}: {
  offer: SupplierOffer;
  // Владелец, 2026-09-03: "1 заявка на поставку — одна ветка" — null здесь
  // означает "основная" переписка офера (как было всегда), непустое
  // значение — конкретная дополнительная заявка (SupplierOrder). Какой
  // именно тред показывать/куда слать — решает этот проп, не сам компонент.
  order: SupplierOrder | null;
  request: SupplierRequest;
  requests: SupplierRequest[];
  // Все письма ЭТОГО офера (по всем его заявкам разом, не только текущей) —
  // компонент сам фильтрует до нужного треда по order (см. threadEmails
  // ниже); везде внутри компонента используется именно отфильтрованный
  // threadEmails, не этот проп напрямую.
  emails: SupplierOfferEmail[];
  templates: EmailTemplate[];
  ledgers: MaterialLedger[];
  allMaterials: { item: PurchaseItem; context: string }[];
  legalEntities: LegalEntity[];
  onEmailSent: (email: SupplierOfferEmail) => void;
  onTemplateSaved: (template: EmailTemplate) => void;
  onLedgersChange: (ledgers: MaterialLedger[]) => void;
  onOfferUpdated: (offer: SupplierOffer) => void;
  onReliabilityChecked: (r: SupplierReliability) => void;
  reliabilityByInn: Map<string, SupplierReliability>;
  onOrderUpdated: (order: SupplierOrder) => void;
  onEmailUpdated: (email: SupplierOfferEmail) => void;
  onQuotesChange: (update: (prev: SupplierQuote[]) => SupplierQuote[]) => void;
  // Черновики автоответов, ждущие решения человека — ВСЕ сразу (страница
  // держит один список на всю вкладку, как и письма), компонент сам
  // отбирает свои по emailId. Писем этого треда среди них может не быть
  // вовсе — тогда ничего и не рисуется.
  pendingAutoReplies: EmailAutoReplyLogEntry[];
  onAutoReplyReviewed: (id: string) => void;
}) {
  // Письма именно текущего треда — основной переписки (order=null) или
  // конкретной заявки. e.orderId null и undefined тут не разводим, в базе
  // всегда либо null, либо реальный uuid (см. data/supplierOfferEmails.ts).
  const threadEmails = useMemo(
    () => emails.filter((e) => (e.orderId ?? null) === (order?.id ?? null)),
    [emails, order?.id],
  );
  const [subject, setSubject] = useState(() => defaultSubject(threadEmails.length > 0, order?.title ?? ''));
  const [body, setBody] = useState(() => defaultBody(threadEmails.length > 0));
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  // Ведомость материалов, прикреплённая к текущему черновику (владелец,
  // 2026-09-03) — одна на письмо, xlsx уже сгенерирован (LedgerAttachment),
  // реально уходит вместе с письмом только по нажатию "Отправить".
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [pendingLedger, setPendingLedger] = useState<LedgerAttachment | null>(null);
  // Владелец, 2026-09-10: "мне нужна возможность прикреплять файлы к
  // письму: картинки, таблицы, не ограничивай форматы лучше" — обычные
  // файловые вложения, отдельно от ведомости (та собирается в своей
  // модалке из позиций сметы) — тут просто то, что выбрали в проводнике,
  // любых форматов, можно несколько штук подряд. Тот же принцип "черновик
  // до отправки", что и у pendingLedger.
  const [manualAttachments, setManualAttachments] = useState<LedgerAttachment[]>([]);
  const [attachingFiles, setAttachingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAttachingFiles(true);
    try {
      const attached = await Promise.all(Array.from(files).map((f) => fileToAttachment(f)));
      setManualAttachments((prev) => [...prev, ...attached]);
    } catch {
      setSendError('Не удалось прикрепить файл — попробуйте ещё раз');
    } finally {
      setAttachingFiles(false);
    }
  }

  function removeManualAttachment(index: number) {
    setManualAttachments((prev) => prev.filter((_, i) => i !== index));
  }
  // Владелец, 2026-09-06: "по умолчанию прикреплять карточку организации...
  // но только к первому письму" — isFirstOutgoingToOffer смотрит на ВСЕ
  // письма поставщика (emails, не threadEmails — карточка нужна один раз на
  // контрагента, не на тред), skipOrgCard даёт снять галочку на конкретное
  // письмо, если вдруг не нужно (по аналогии с pendingLedger — можно убрать).
  //
  // Владелец, 2026-09-09: карточка организации больше не одна на всё
  // приложение (см. историю в data/legalEntities.ts) — какую именно
  // прикладывать, решает юрлицо КАТЕГОРИИ (request.legalEntityId, с
  // фолбэком на юрлицо по умолчанию). Если у выбранного юрлица ещё нет
  // загруженной карточки (cardFile=null) — прикладывать нечего, чип вообще
  // не показывается, ничего не выдумываем.
  const legalEntity = resolveRequestLegalEntity(request.legalEntityId, legalEntities);
  const [skipOrgCard, setSkipOrgCard] = useState(false);
  const attachOrgCard = isFirstOutgoingToOffer(emails, offer.id) && !skipOrgCard && !!legalEntity?.cardFile;
  // Владелец, 2026-09-11: "хочу прикреплять к поставкам вместе с ведомостью
  // материала и карточкой организации ещё инфу по доставке" (адрес объекта,
  // машины до 20 тонн с боковой разгрузкой и т.п.) — тот же файл юрлица и
  // ровно то же правило, что у карточки: первому письму поставщику, со
  // своим крестиком, если в конкретном письме не нужно. Текст/файл
  // заводится на странице юрлица (Документы → Юрлица), нет файла — чипа
  // нет и вложения нет.
  const [skipDeliveryInfo, setSkipDeliveryInfo] = useState(false);
  const attachDeliveryInfo =
    isFirstOutgoingToOffer(emails, offer.id) && !skipDeliveryInfo && !!legalEntity?.deliveryFile;
  // Какие письма развёрнуты (показана свёрнутая цитата целиком) — по id,
  // сбрасывается сам собой при смене offer (новый emails-список).
  const [expandedQuoteIds, setExpandedQuoteIds] = useState<Set<string>>(new Set());
  // Владелец, 2026-09-03: "форма пустого письма не нужна, лучше сделай саму
  // кнопку Ответить побольше" — форма Тема/Сообщение не висит постоянно, а
  // открывается по "Ответить" на конкретном письме. Отдельная кнопка
  // "Написать" (для сообщения не в ответ на конкретное письмо) была здесь же,
  // убрана тем же днём ("Убирай кнопку написать, оставляем только Ответить").
  // Открыта по умолчанию только когда в треде вообще ещё нет писем — иначе
  // первое письмо было бы физически некому "ответить".
  const [composerOpen, setComposerOpen] = useState(threadEmails.length === 0);
  // Цитата письма, на которое отвечаем (владелец, 2026-09-10: "как в
  // обычном email-ящике: нажал ответить, оно сохранило всю переписку под
  // катом, а сверху уже пишешь ответ свой") — отдельно от body (то, что
  // печатает пользователь), не смешивается с ним: подклеивается к телу
  // только в момент отправки (см. handleSend). quotedReplyExpanded —
  // свёрнута ли цитата в форме ("под катом" по умолчанию).
  const [quotedReplyText, setQuotedReplyText] = useState<string | null>(null);
  const [quotedReplyExpanded, setQuotedReplyExpanded] = useState(false);
  // Владелец, 2026-09-10: "не очевидно, что внизу появилось окошко для
  // написания письма. Пусть страницу туда сама перебрасывает" — композер
  // может открыться далеко под уже прочитанной лентой писем (особенно у
  // длинных тредов), сам по себе он не попадает в область видимости.
  // Скроллим к нему только по явному клику "Ответить" (handleReplyTo), не
  // при обычном открытии/первом рендере — иначе страница дёргалась бы и
  // тогда, когда композер и так уже виден.
  const composerRef = useRef<HTMLDivElement>(null);
  // Предпросмотр вложения (владелец: "мне бы предпросмотр, как договора") —
  // просто просмотр PDF/докс/картинки прямо в приложении, без ручной кнопки
  // распознавания (была здесь, убрана владельцем 2026-09-03 — см. комментарий
  // выше про isValidCurrency: автоматика справляется сама).
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  // Черновик автоответа: какой сейчас отправляется/отклоняется (блокируем
  // повторные клики) и ошибка последнего действия.
  const [autoReplyBusyId, setAutoReplyBusyId] = useState<string | null>(null);
  const [autoReplyError, setAutoReplyError] = useState<string | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [applyingExtraction, setApplyingExtraction] = useState(false);
  // Владелец, 2026-09-03: "давай зашивать лучшие цены на позиции... давай
  // сверять вручную" — какому материалу сметы соответствует каждая
  // распознанная позиция счёта (по индексу в extraction.items), выбирается
  // в footer предпросмотра (ниже). Сбрасывается/предзаполняется подсказкой
  // при открытии предпросмотра нового счёта, см. эффект ниже.
  const [materialMatches, setMaterialMatches] = useState<Record<number, MaterialMatch>>({});

  // Черновик по умолчанию завязан на конкретный тред (предложение + заявка) —
  // при переключении между тредами (вкладка "Переписка", в т.ч. между
  // разными заявками одного поставщика) нужно пересчитать и тему, и текст,
  // иначе останется черновик предыдущего треда. Новый тред = чистый
  // черновик, ничего печатного до этого момента тут не теряется — сброс
  // срабатывает только на реальную смену offer.id/order.id. hasHistory
  // читает threadEmails на момент срабатывания эффекта (не входит в
  // зависимости намеренно) — важно только "было ли хоть одно письмо к
  // моменту открытия ЭТОГО треда", не реагировать на каждое новое письмо.
  useEffect(() => {
    const hasHistory = threadEmails.length > 0;
    setSubject(defaultSubject(hasHistory, order?.title ?? ''));
    setBody(defaultBody(hasHistory));
    setSendError(null);
    setSelectedTemplateId('');
    setComposerOpen(!hasHistory);
    setPendingLedger(null);
    setManualAttachments([]);
    setSkipOrgCard(false);
    setSkipDeliveryInfo(false);
    setQuotedReplyText(null);
    setQuotedReplyExpanded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.id, order?.id]);

  // Шаблоны этого запроса первыми, общие — следом (EMAIL_CORRESPONDENCE_PLAN.md,
  // этап 3: "сначала шаблоны с request_id этого запроса, затем общие").
  const orderedTemplates = useMemo(() => {
    const own = templates.filter((t) => t.requestId === request.id);
    const shared = templates.filter((t) => t.requestId !== request.id);
    return [...own, ...shared];
  }, [templates, request.id]);

  function handlePickTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    // Не затираем молча уже напечатанный текст — только тема (короткая,
    // почти всегда одна и та же по умолчанию) заменяется без вопросов.
    if (body.trim() && !window.confirm('Заменить уже введённый текст письма шаблоном?')) return;
    const rendered = renderEmailTemplate(template, { offer, request });
    setSubject(rendered.subject);
    setBody(rendered.body);
  }

  // Черновики ИИ-закупщика, относящиеся именно к этому треду. Привязка —
  // к ВХОДЯЩЕМУ письму, на которое предложен ответ (email_auto_reply_log.
  // email_id), поэтому и фильтруем по письмам треда, а не по офферу: у
  // поставщика может быть несколько веток (доп. заявки), черновик должен
  // висеть только в своей.
  const threadDrafts = useMemo(() => {
    if (pendingAutoReplies.length === 0) return [];
    const ids = new Set(threadEmails.map((e) => e.id));
    return pendingAutoReplies.filter((d) => ids.has(d.emailId));
  }, [pendingAutoReplies, threadEmails]);

  // Тема ответа: правило могло не задавать свою (тогда в черновике пусто) —
  // отвечаем в тему исходного письма, как и обычная кнопка "Ответить".
  function draftSubjectFor(draft: EmailAutoReplyLogEntry): string {
    if (draft.draftSubject.trim()) return draft.draftSubject;
    const source = threadEmails.find((e) => e.id === draft.emailId);
    return source ? buildQuotedReply(source).subject : '';
  }

  async function handleSendDraft(draft: EmailAutoReplyLogEntry) {
    if (!offer.email || autoReplyBusyId) return;
    setAutoReplyBusyId(draft.id);
    setAutoReplyError(null);
    try {
      // Тот же путь, что и у обычного письма из формы — отдельного
      // "серверного" способа отправки у черновиков нет: человек нажал
      // кнопку, значит письмо уходит от него, как любое другое.
      const email = await sendSupplierOfferEmail({
        offerId: offer.id,
        orderId: order?.id ?? null,
        toAddress: offer.email,
        subject: draftSubjectFor(draft),
        body: draft.draftBody,
      });
      onEmailSent(email);
      await markAutoReplyReviewed(draft.id, 'sent');
      onAutoReplyReviewed(draft.id);
    } catch (err) {
      setAutoReplyError(errorMessage(err, 'Не удалось отправить ответ'));
    } finally {
      setAutoReplyBusyId(null);
    }
  }

  // "Изменить" — черновик переезжает в обычную форму ответа и перестаёт
  // висеть карточкой: дальше это обычное письмо, которое пишет человек.
  // Сам текст никуда не пропадает и в случае сбоя отметки — он уже в форме,
  // а в логе решений строка остаётся навсегда.
  async function handleEditDraft(draft: EmailAutoReplyLogEntry) {
    if (autoReplyBusyId) return;
    setAutoReplyBusyId(draft.id);
    setAutoReplyError(null);
    setSubject(draftSubjectFor(draft));
    setBody(draft.draftBody);
    setComposerOpen(true);
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    try {
      await markAutoReplyReviewed(draft.id, 'edited');
      onAutoReplyReviewed(draft.id);
    } catch (err) {
      setAutoReplyError(errorMessage(err, 'Текст перенесён в форму, но черновик не удалось убрать из очереди'));
    } finally {
      setAutoReplyBusyId(null);
    }
  }

  async function handleRejectDraft(draft: EmailAutoReplyLogEntry) {
    if (autoReplyBusyId) return;
    setAutoReplyBusyId(draft.id);
    setAutoReplyError(null);
    try {
      await markAutoReplyReviewed(draft.id, 'rejected');
      onAutoReplyReviewed(draft.id);
    } catch (err) {
      setAutoReplyError(errorMessage(err, 'Не удалось отклонить черновик'));
    } finally {
      setAutoReplyBusyId(null);
    }
  }

  function handleReplyTo(e: SupplierOfferEmail) {
    // Не трогаем body — там только то, что печатает пользователь, цитата
    // живёт отдельно (quotedReplyText) и подклеивается только при отправке
    // (см. handleSend). Никакого confirm() — заменять здесь нечего.
    const quoted = buildQuotedReply(e);
    setSubject(quoted.subject);
    setQuotedReplyText(quoted.quoted);
    setQuotedReplyExpanded(false);
    setComposerOpen(true);
    // requestAnimationFrame, не сразу — composerRef.current в момент этого
    // клика ещё может быть null (композер только что открылся тем же
    // setComposerOpen(true) выше, DOM обновится после коммита рендера).
    // Владелец, 2026-09-10: "не видно кнопки отправки" — было block:'start'
    // (верх композера к верху видимой области), из-за чего на невысоких
    // экранах кнопка "Отправить" (самый низ композера) всё равно оставалась
    // за кадром — сам композер выше доступной высоты, "верх" и "низ" не
    // помещаются одновременно. block:'end' решает именно её жалобу: если
    // композер целиком помещается — результат тот же, что и раньше (нечего
    // подрезать ни сверху, ни снизу); если нет — в кадре остаётся низ с
    // кнопкой "Отправить", а не шапка формы.
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }

  function toggleQuoteExpanded(emailId: string) {
    setExpandedQuoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  }

  function openPreview(f: PreviewFile) {
    setPreviewFile(f);
  }

  function closePreview() {
    setPreviewFile(null);
  }

  // Владелец, 2026-09-03: "я не вижу счёт, но есть кнопка подтвердить. А
  // если смотрю счёт в предпросмотре, нет кнопки подтвердить — нелогично" —
  // решение: карточка "Похоже, это счёт" открывает предпросмотр САМОГО
  // файла (не просто сводку), а кнопки подтверждения/отклонения переезжают
  // в футер предпросмотра — рядом с уже видимым документом. Это письмо
  // (если есть) ищем по совпадению url текущего previewFile с
  // sourceFile — так футер понимает, что показывать, независимо от того,
  // как открыт предпросмотр (кнопка на карточке или обычный клик по
  // вложению).
  // 2026-09-12: сюда же попадает и счёт, который система записала в базу
  // сама (autoApplied) — у него в футере не "подтвердить", а "сохранить
  // сопоставление со сметой" и откат, но список позиций и сам документ
  // показываются точно так же.
  // 2026-09-14: ищем не только письмо, но и КОНКРЕТНЫЙ счёт — в письме их
  // может быть несколько, и футер должен показывать позиции того счёта,
  // который сейчас открыт, а не всегда первого.
  const previewExtraction = useMemo(() => {
    if (!previewFile) return null;
    for (const e of threadEmails) {
      const invoice = invoiceOfFile(e, previewFile.url);
      if (invoice && (e.extraction?.status === 'pending' || autoApplied(e, invoice))) return { email: e, invoice };
    }
    return null;
  }, [previewFile, threadEmails]);

  // Заранее подставляем очевидные совпадения (suggestMaterialMatch), но
  // только при открытии НОВОГО счёта — иначе переоткрытие того же
  // previewFile на каждый ре-рендер стирало бы уже сделанный вручную выбор.
  // allMaterials намеренно не в зависимостях — ссылка стабильна на весь
  // сеанс работы со страницей (см. Suppliers.tsx), реагировать на неё смысла
  // нет.
  useEffect(() => {
    if (!previewExtraction) {
      setMaterialMatches({});
      return;
    }
    // У автозаписанного счёта позиции уже лежат в карточке — если закупщица
    // их когда-то сверила, показываем СОХРАНЁННОЕ сопоставление, а не
    // подсказку заново (иначе повторное открытие счёта молча предлагало бы
    // откатить её ручной выбор).
    const applied = autoApplied(previewExtraction.email, previewExtraction.invoice);
    const storedItems = applied ? (applied.target === 'order' ? (order?.items ?? []) : offer.items) : [];
    const initial: Record<number, MaterialMatch> = {};
    previewExtraction.invoice.items.forEach((it, idx) => {
      const stored = applied ? storedItems.find((i) => i.id === applied.itemIds[idx]) : undefined;
      if (stored?.sourceMaterialId || stored?.matchKind === 'delivery') {
        initial[idx] = {
          materialId: stored.sourceMaterialId ?? '',
          unitPrice: stored.unitPrice != null ? String(stored.unitPrice) : '',
          kind: stored.matchKind ?? 'exact',
          note: stored.matchNote ?? '',
          productUrl: stored.productUrl ?? '',
        };
        return;
      }
      if (looksLikeDeliveryItem(it.name)) {
        initial[idx] = { ...emptyMatch(), kind: 'delivery' };
        return;
      }
      const suggestion = suggestMaterialMatch(it.name, allMaterials);
      if (suggestion) initial[idx] = { ...emptyMatch(suggestion), unitPrice: computeUnitPriceGuess(it, suggestion, allMaterials) };
    });
    setMaterialMatches(initial);
    // Ключ — url открытого файла, а не id письма: у письма с двумя счетами
    // id один, и по нему сопоставление не пересчиталось бы при переходе от
    // одного счёта к другому.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewFile?.url]);

  async function handleConfirmAutoExtraction(e: SupplierOfferEmail, invoice: EmailExtractionInvoice) {
    if (!e.extraction || applyingExtraction) return;
    const extraction = e.extraction;
    setApplyingExtraction(true);
    setExtractionError(null);
    try {
      const sourceFile = invoice.sourceFile ?? null;
      // Позиции создаются ОДИН раз и в этом виде уходят и в карточку, и в
      // строку КП, и в снимок applied.itemIds — по нему потом находится,
      // какие строки карточки пришли именно из этого счёта.
      const newItems = extractionItemsToPurchaseItems(invoice.items, materialMatches);
      const appliedAt = new Date().toISOString();
      let applied: EmailExtractionApplied;
      // order — текущий открытый тред (тот же, которому принадлежит это
      // письмо, см. threadEmails) — заявка или основная переписка офера.
      if (order) {
        const fileAdded = !!sourceFile && !order.files.some((f) => f.url === sourceFile.url);
        onOrderUpdated(await applyExtractionToOrder(order, invoice, sourceFile, newItems));
        applied = {
          target: 'order',
          targetId: order.id,
          quoteId: null,
          itemIds: newItems.map((i) => i.id),
          fileUrl: sourceFile?.url ?? null,
          fileAdded,
          previous: { price: order.price, currency: order.currency, inn: null },
          appliedAt,
        };
      } else {
        const fileAdded = !!sourceFile && !offer.files.some((f) => f.url === sourceFile.url);
        const updated = await applyExtractionToOffer(offer, invoice, sourceFile, newItems);
        onOfferUpdated(updated);
        // Владелец, 2026-09-11: "когда поставщик прислал счет и нам стали
        // известны реквизиты, запускать процесс верификации поставщика" —
        // вот этот момент. Проверяем только если ИНН ПОЯВИЛСЯ или сменился:
        // повторный счёт от того же юрлица перепроверять незачем, суточный
        // лимит запросов к Checko не резиновый (перепроверить вручную можно
        // кнопкой в карточке).
        //
        // Ошибку глотаем намеренно: подтверждение счёта — основная работа
        // закупщицы, и она не должна падать из-за недоступности стороннего
        // сервиса проверки. Сам сбой сохраняется в строке проверки и виден
        // в карточке поставщика.
        if (updated.inn && updated.inn !== offer.inn) {
          checkSupplierReliability(updated.inn).then(onReliabilityChecked).catch(() => {});
        }
        const quote = await saveExtractionAsQuote(
          offer.id,
          e,
          invoice,
          newItems,
          sourceFile,
          updated.currency,
          quoteTitle(e.subject, sourceFile?.fileName ?? null, extractionInvoices(extraction).length > 1),
        );
        onQuotesChange((prev) => [...prev, quote]);
        applied = {
          target: 'offer',
          targetId: offer.id,
          quoteId: quote.id,
          itemIds: newItems.map((i) => i.id),
          fileUrl: sourceFile?.url ?? null,
          fileAdded,
          previous: { price: offer.price, currency: offer.currency, inn: offer.inn },
          appliedAt,
        };
      }
      // Письмо считается разобранным, только когда записаны ВСЕ его счета:
      // при двух счетах подтверждение первого раньше ставило письму
      // 'confirmed' целиком, и карточка второго счёта просто исчезала из
      // переписки — подтвердить его было негде.
      const nextExtraction = withInvoiceApplied(extraction, invoice, applied);
      const status = extractionInvoices(nextExtraction).every((inv) => inv.applied) ? 'confirmed' : 'pending';
      await setSupplierOfferEmailExtractionStatus(e.id, nextExtraction, status);
      onEmailUpdated({ ...e, extraction: { ...nextExtraction, status } });
      // Владелец, 2026-09-10: "Метрики" считали только submitOffer
      // (правка/создание через форму карточки) — самая частая реальная
      // работа Альмиры, подтверждение автораспознанного счёта прямо в
      // переписке, не логировалась вовсе (applyExtractionToOffer/
      // applyExtractionToOrder зовут updateSupplierOffer/updateSupplierOrder
      // напрямую, минуя submitOffer) — со стороны выглядело так, будто она
      // ничего не делает, хотя КП разбирались одно за другим.
      logActivity('supplier_invoice_confirmed');
      closePreview();
    } catch (err) {
      setExtractionError(errorMessage(err, 'Не удалось применить распознанные данные'));
    } finally {
      setApplyingExtraction(false);
    }
  }

  // Сверка уже записанного счёта со сметой — второй, необязательный шаг
  // автозаписи: цена и позиции в базе с момента приёма письма, но какой
  // строке сметы соответствует "Профиль h30 оцинк." и сколько литров в
  // банке, знает только человек (владелец, 2026-09-04: "давай сверять
  // вручную"). Пишем сопоставление и в карточку, и в саму строку КП —
  // сравнение цен по позициям читает и то, и другое.
  async function handleSaveMaterialMatches(e: SupplierOfferEmail, invoice: EmailExtractionInvoice) {
    const applied = autoApplied(e, invoice);
    if (!applied || applyingExtraction) return;
    setApplyingExtraction(true);
    setExtractionError(null);
    try {
      if (order && applied.target === 'order') {
        onOrderUpdated(
          await updateSupplierOrder(order.id, {
            title: order.title,
            communicationStatus: order.communicationStatus,
            price: order.price,
            currency: order.currency,
            deadline: order.deadline,
            requirements: order.requirements,
            items: withMaterialMatches(order.items, applied, materialMatches),
            files: order.files,
          }),
        );
      } else {
        onOfferUpdated(
          await updateSupplierOffer(offer.id, {
            requestId: offer.requestId,
            name: offer.name,
            contact: offer.contact,
            contactMethod: offer.contactMethod,
            email: offer.email,
            managerName: offer.managerName,
            country: offer.country,
            websiteUrl: offer.websiteUrl,
            listingUrl: offer.listingUrl,
            contactSource: offer.contactSource,
            messengers: offer.messengers,
            catalogModelName: offer.catalogModelName,
            catalogModelPhoto: offer.catalogModelPhoto,
            price: offer.price,
            currency: offer.currency,
            items: withMaterialMatches(offer.items, applied, materialMatches),
            files: offer.files,
            verified: offer.verified,
            inn: offer.inn,
          }),
        );
      }
      // Позиции строки КП — те же самые объекты с теми же id, что легли в
      // карточку (их пишет одним списком api/_invoiceApply.js), поэтому
      // собираем их из карточки по applied.itemIds, а не тянем КП отдельным
      // запросом: в переписке объекта КП нет.
      if (applied.quoteId) {
        const quoteId = applied.quoteId;
        const quoteItems = withMaterialMatches(
          applied.itemIds
            .map((id) => offer.items.find((i) => i.id === id))
            .filter((i): i is PurchaseItem => !!i),
          applied,
          materialMatches,
        );
        await updateSupplierQuoteItems(quoteId, quoteItems);
        onQuotesChange((prev) => prev.map((q) => (q.id === quoteId ? { ...q, items: quoteItems } : q)));
      }
      // Сверка счёта — та же работа закупщицы, что и прежнее ручное
      // подтверждение, и считается в "Метриках" тем же событием (владелец,
      // 2026-09-10: до этого самый частый её путь не логировался вовсе).
      logActivity('supplier_invoice_confirmed');
      closePreview();
    } catch (err) {
      setExtractionError(errorMessage(err, 'Не удалось сохранить сопоставление позиций'));
    } finally {
      setApplyingExtraction(false);
    }
  }

  // "Это не счёт" для автозаписанного распознавания — не просто пометка, а
  // откат записи: система сработала без человека, значит и убрать за собой
  // должна полностью (иначе ошибочно распознанная презентация навсегда
  // оставит в сравнении цен чужую сумму).
  async function handleUndoAutoExtraction(e: SupplierOfferEmail, invoice: EmailExtractionInvoice) {
    const applied = autoApplied(e, invoice);
    const extraction = e.extraction;
    if (!applied || !extraction || applyingExtraction) return;
    if (!window.confirm('Убрать распознанный счёт из базы? Цена, позиции и файл, записанные из этого письма, будут удалены из карточки, прежние значения вернутся.')) return;
    setApplyingExtraction(true);
    setExtractionError(null);
    try {
      if (applied.quoteId) {
        const quoteId = applied.quoteId;
        await deleteSupplierQuote(quoteId);
        onQuotesChange((prev) => prev.filter((q) => q.id !== quoteId));
      }
      if (order && applied.target === 'order') {
        onOrderUpdated(await revertAppliedOnOrder(order, applied));
      } else {
        onOfferUpdated(await revertAppliedOnOffer(offer, applied));
      }
      const next = withInvoiceRemoved(extraction, invoice);
      await setSupplierOfferEmailExtractionStatus(e.id, next, next.status);
      onEmailUpdated({ ...e, extraction: next });
      closePreview();
    } catch (err) {
      setExtractionError(errorMessage(err, 'Не удалось убрать распознанный счёт из базы'));
    } finally {
      setApplyingExtraction(false);
    }
  }

  async function handleDismissAutoExtraction(e: SupplierOfferEmail, invoice: EmailExtractionInvoice) {
    if (!e.extraction) return;
    const extraction = e.extraction;
    try {
      const next = withInvoiceRemoved(extraction, invoice);
      await setSupplierOfferEmailExtractionStatus(e.id, next, next.status);
      onEmailUpdated({ ...e, extraction: next });
      closePreview();
    } catch {
      // Тихий сбой достаточен — карточка просто останется видна, можно
      // нажать ещё раз, это не критичное действие.
    }
  }

  async function handleSend() {
    if (!offer.email || !body.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const orgCardAttachment =
        attachOrgCard && legalEntity?.cardFile ? await fetchDocumentFileAsAttachment(legalEntity.cardFile) : null;
      const deliveryInfoAttachment =
        attachDeliveryInfo && legalEntity?.deliveryFile
          ? await fetchDocumentFileAsAttachment(legalEntity.deliveryFile)
          : null;
      const attachments = [
        ...(pendingLedger ? [pendingLedger] : []),
        ...manualAttachments,
        ...(orgCardAttachment ? [orgCardAttachment] : []),
        ...(deliveryInfoAttachment ? [deliveryInfoAttachment] : []),
      ];
      // Цитата (quotedReplyText) живёт отдельно от того, что печатает
      // пользователь, весь черновик — только теперь, на отправку, склеиваем
      // их в одно письмо (получатель должен видеть всю историю, как и
      // раньше, просто пока пишем ответ — не смешано в одном textarea).
      const fullBody = quotedReplyText ? `${body.trim()}\n\n${quotedReplyText}` : body;
      const email = await sendSupplierOfferEmail({
        offerId: offer.id,
        orderId: order?.id ?? null,
        toAddress: offer.email,
        subject,
        body: fullBody,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      onEmailSent(email);
      setBody('');
      setQuotedReplyText(null);
      setQuotedReplyExpanded(false);
      setComposerOpen(false);
      setPendingLedger(null);
      setManualAttachments([]);
    } catch (err) {
      setSendError(errorMessage(err, 'Не удалось отправить письмо'));
    } finally {
      setSending(false);
    }
  }

  return (
    // Владелец, 2026-09-10: "весь блок письма был виден на экране" — на lg+
    // сам композер (ниже) остаётся обычным shrink-0 (не растягивается,
    // видим целиком), а лента писем ("Переписка" ниже) забирает всю
    // оставшуюся высоту и сама скроллится — так кнопка "Отправить" никогда
    // не уезжает за нижний край экрана. Работает и внутри модалки быстрого
    // "Написать" (OfferEmailModal — max-h-[90vh] + overflow-y-auto на самой
    // модалке), не только на вкладке "Письма".
    // Владелец, 2026-09-11: вся эта раскладка "по высоте окна" теперь только
    // под roomy (см. src/index.css) — на невысоком окне она ужимала ленту
    // писем в ноль, см. комментарий у самой ленты ниже. Внутри roomy цепочка
    // min-h-0 осталась (без неё лента не прокручивается внутри себя, а растёт
    // по содержимому и уводит композер за экран), а от схлопывания страхует
    // пол высоты на блоке "Переписка" ниже.
    <div className="flex flex-col gap-4 roomy:min-h-0 roomy:flex-1">
      {/* Владелец, 2026-09-03: флаг страны из заголовка карточки убран
          (слишком много флагов на экране, см. запись про список слева),
          категория (раньше отдельным бейджем у заголовка выше, см.
          SupplierCorrespondenceTab) переехала сюда же, к остальным
          реквизитам — и слово "Страна:" убрано, флага самого по себе
          достаточно. */}
      <div className="flex flex-col gap-1 text-sm text-ink-muted">
        <span>Email: {offer.email || 'не указан'}</span>
        <span>Адрес для переписки: {supplierOfferEmailAddress(order?.shortCode ?? offer.shortCode)}</span>
        <span>Категория: {request.title}</span>
        {order && <span>Заявка: {order.title || 'без названия'}</span>}
        {offer.country && <span title={offer.country}>{countryFlag(offer.country)}</span>}
      </div>

      <div className="flex flex-col gap-2 roomy:min-h-60 roomy:flex-1">
        <span className="text-sm font-semibold text-ink">Переписка</span>
        {extractionError && <p className="text-sm text-danger">{extractionError}</p>}
        {threadEmails.length === 0 && <p className="text-sm text-ink-faint">Писем пока нет.</p>}
        {threadEmails.length > 0 && (
          // Владелец, 2026-09-11: "зажато размерами экрана, а не скроллится
          //     разумно вниз" — у закупщицы (окно ~570 px по высоте) этот блок
          //     получал ровно 0 px. Своя прокрутка у ленты осталась (она и
          //     держит композер на виду), но включается только под roomy —
          //     на невысоком окне письма идут натуральной высотой и вниз
          //     скроллится сама страница. Пол высоты стоит на родителе
          //     ("Переписка" выше, roomy:min-h-60), а не здесь: на самой
          //     ленте он вылезал за сжатого min-h-0 родителя и налезал на
          //     композер (проверено на макете со скомпилированным CSS).
          <div className="flex flex-col gap-2 roomy:min-h-0 roomy:flex-1 roomy:overflow-y-auto">
            {/* Предложенный ИИ-закупщиком ответ — над лентой, рядом с самым
                свежим письмом (лента идёт от новых к старым). Это ещё не
                письмо: ничего никуда не ушло, пока человек не нажал
                "Отправить". Правила с режимом "Отправлять автоматически"
                сюда не попадают вовсе — там ответ уже в ленте, обычным
                исходящим письмом с подписью ИИ-закупщика. */}
            {autoReplyError && <p className="text-sm text-danger">{autoReplyError}</p>}
            {threadDrafts.map((draft) => (
              <div key={draft.id} className="flex flex-col gap-2 rounded-control border border-primary/40 bg-primary/5 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <span className="flex items-center gap-1 font-semibold text-ink">
                    <Bot className="h-3.5 w-3.5" />
                    ИИ-закупщик предлагает ответ
                  </span>
                  {draft.ruleName && <span>· ситуация «{draft.ruleName}»</span>}
                  <span className="ml-auto">{new Date(draft.createdAt).toLocaleString('ru-RU')}</span>
                </div>
                {draft.reason && <div className="text-xs text-ink-faint">Почему так решил: {draft.reason}</div>}
                {draftSubjectFor(draft) && <div className="font-semibold text-ink">{draftSubjectFor(draft)}</div>}
                <div className="whitespace-pre-wrap text-ink">{draft.draftBody}</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    icon={<Send className="h-4 w-4" />}
                    disabled={autoReplyBusyId === draft.id || !offer.email}
                    onClick={() => handleSendDraft(draft)}
                  >
                    {autoReplyBusyId === draft.id ? 'Отправляем...' : 'Отправить'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<Reply className="h-4 w-4" />}
                    disabled={autoReplyBusyId === draft.id}
                    onClick={() => handleEditDraft(draft)}
                  >
                    Изменить
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<X className="h-4 w-4" />}
                    disabled={autoReplyBusyId === draft.id}
                    onClick={() => handleRejectDraft(draft)}
                  >
                    Отклонить
                  </Button>
                </div>
              </div>
            ))}
            {/* Владелец, 2026-09-03: "когда много писем, приходится листать в
                самый низ... я бы делал обратную хронологию — последнее письмо
                наверху" — [...emails] копия перед reverse(), исходный emails
                (по возрастанию даты) нужен как есть в других местах (threadStatus
                читает emails[emails.length-1] как последнее). */}
            {[...threadEmails].reverse().map((e, i) => {
              const { visible, quoted } = splitQuotedReply(e.body);
              const isQuoteExpanded = expandedQuoteIds.has(e.id);
              // Владелец, 2026-09-03: "кнопка Ответить нужна только на
              // последнем письме" — после reverse() индекс 0 и есть самое
              // свежее письмо треда (хронологически последнее).
              const isLatest = i === 0;
              return (
              <div
                key={e.id}
                className={cn(
                  'flex flex-col gap-1 rounded-control p-3 text-sm',
                  // Владелец, 2026-09-03: "слишком много красного цвета...
                  // остальное делай нейтральным" — направление письма теперь
                  // различимо только отступом (ml/mr) и подписью
                  // "Отправлено"/"Получено", без цветового акцента.
                  e.direction === 'out' ? 'ml-6 border border-border bg-surface' : 'mr-6 bg-surface-muted',
                )}
              >
                {/* Исходящее письмо может ещё не уйти: при временном отказе
                    почты (владелец, 2026-09-12 — закончился дневной лимит
                    Resend) оно всё равно сохраняется и ждёт очереди, см.
                    data/emailSendStatus.ts. Раньше такое письмо не
                    сохранялось вообще, и в ленте его просто не было. */}
                <div className="flex items-center justify-between gap-2 text-xs text-ink-faint">
                  <span
                    className={cn(
                      'flex items-center gap-1',
                      e.direction === 'out' && e.sendStatus === 'failed' && 'text-danger',
                    )}
                  >
                    {e.direction !== 'out' || e.sendStatus === 'sent' ? (
                      <Mail className="h-3 w-3" />
                    ) : e.sendStatus === 'queued' ? (
                      <Clock className="h-3 w-3" />
                    ) : (
                      <AlertTriangle className="h-3 w-3" />
                    )}
                    {e.direction === 'out' ? emailSendStatusLabel[e.sendStatus] : 'Получено'}
                    {e.direction === 'out' && e.sentByName === AUTO_REPLY_SENDER_NAME && (
                      <span className="flex items-center gap-1 text-ink-faint">
                        <Bot className="h-3 w-3" />
                        автоответ
                      </span>
                    )}
                  </span>
                  <span>{new Date(e.createdAt).toLocaleString('ru-RU')}</span>
                </div>
                {e.direction === 'out' && e.sendStatus === 'queued' && (
                  <div className="text-xs text-ink-faint">
                    {/* Автоответ ВСЕГДА уходит через очередь (его ставит не
                        браузер, а почасовая сессия — см. SQL-функцию
                        auto_reply_apply), поэтому "в очереди" у него значит
                        просто "вот-вот уйдёт", а не поломку почты. */}
                    {e.sentByName === AUTO_REPLY_SENDER_NAME && !e.sendError
                      ? 'Автоответ поставлен в очередь — уйдёт в ближайшую минуту.'
                      : `Почта временно недоступна — письмо уйдёт само, как только отправка заработает.${e.sendError ? ` Причина: ${e.sendError}` : ''}`}
                  </div>
                )}
                {e.direction === 'out' && e.sendStatus === 'failed' && (
                  <div className="text-xs text-danger">
                    Письмо не отправлено{e.sendError ? `: ${e.sendError}` : ''}. Текст сохранён — можно скопировать и
                    отправить заново.
                  </div>
                )}
                {e.subject && <div className="font-semibold text-ink">{e.subject}</div>}
                {/* Владелец, 2026-09-03: "все приложения к письмам в виде файлов
                    пусть прикрепляются к верху письма" — вложения сразу после
                    темы, до текста, а не в самом низу карточки. */}
                {e.files.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {e.files.map((f, i) => {
                      // Владелец, 2026-09-03: "когда внесли данные в
                      // таблицу, давай напротив файла в письме ставить
                      // пометку, что инфа в базе" — сравниваем по url с
                      // sourceFile уже ПОДТВЕРЖДЁННОГО распознавания этого
                      // письма (не pending/dismissed — только когда данные
                      // реально попали в карточку предложения).
                      // 2026-09-14: сравниваем со ВСЕМИ счетами письма, а не
                      // с одним. Именно это владелец видел три раза подряд:
                      // в письме Авангарда два счёта, оба записаны в базу, а
                      // пометку получал только первый — второй выглядел
                      // нераспознанным.
                      const fileInvoice = invoiceOfFile(e, f.url);
                      const inDb = e.extraction?.status === 'confirmed' && !!fileInvoice;
                      const duplicateOf = fileInvoice ? duplicateOriginalName(fileInvoice, f.url) : null;
                      const inDbBadge = inDb && (
                        <span
                          className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-success"
                          title={
                            duplicateOf
                              ? `Тот же счёт, что и «${duplicateOf}» — данные взяты из него, отдельным КП этот файл не заводится`
                              : undefined
                          }
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {duplicateOf ? 'Тот же счёт' : 'Данные в базе'}
                        </span>
                      );
                      return isImageFile(f.fileName) ? (
                        <div key={i} className="flex flex-col items-start gap-1">
                          <a href={f.url} target="_blank" rel="noreferrer" className="block w-fit">
                            <img
                              src={f.url}
                              alt={f.fileName}
                              className="max-h-48 max-w-full rounded-control border border-border object-contain"
                            />
                          </a>
                          {inDbBadge}
                        </div>
                      ) : isPreviewable(f.fileName) ? (
                        // Владелец: "мне бы предпросмотр, как договора" —
                        // открываем в DocumentPreviewModal вместо новой
                        // вкладки браузера.
                        <button
                          key={i}
                          type="button"
                          onClick={() => openPreview(f)}
                          className="flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 py-1.5 text-left text-xs text-ink hover:underline"
                        >
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                          <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                          {inDbBadge}
                        </button>
                      ) : (
                        <a
                          key={i}
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-ink hover:underline"
                        >
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                          <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                          {inDbBadge}
                        </a>
                      );
                    })}
                  </div>
                )}
                {/* Владелец, 2026-09-03: "система [должна] понимать, что перед
                    ней счёт... а Альмира только сверяла и подтверждала" —
                    автоматически распознанный счёт ждёт подтверждения прямо
                    здесь, рядом с письмом, из которого он взят. Тем же днём,
                    доработка: "я не вижу счёт, но есть кнопка подтвердить...
                    нелогично" — карточка теперь только сводка + кнопка
                    "Посмотреть и подтвердить", сам выбор (подтвердить/это не
                    счёт) — в футере предпросмотра, рядом с открытым файлом
                    (см. previewExtraction выше). Прямые кнопки здесь —
                    только запасной путь для писем без sourceFile (записи до
                    того, как это поле появилось) — посмотреть файл негде. */}
                {/* Счёт, записанный системой автоматически (владелец,
                    2026-09-12: "мне нужно автоматическое распознавание
                    счетов и запись в базу ещё до открытия письма нами
                    вручную") — тут уже нечего подтверждать, данные в базе с
                    момента приёма письма. Остаётся необязательная сверка
                    позиций со сметой (её система сделать за человека не
                    может, см. handleSaveMaterialMatches) и откат, если
                    счётом оказалось что-то другое. */}
                {/* 2026-09-14: карточка на КАЖДЫЙ счёт письма. Их может быть
                    несколько (владелец: "в письме два счета... я как раз
                    сравниваю альтернативные материалы"), и у каждого своя
                    судьба: один сверен со сметой, другой откачен. */}
                {extractionInvoices(e.extraction).map((invoice, invoiceIdx, allInvoices) => {
                  const applied = autoApplied(e, invoice);
                  if (!applied && e.extraction?.status !== 'pending') return null;
                  // У письма с одним счётом подпись прежняя; когда счетов
                  // несколько, каждый подписан своим файлом — иначе две
                  // одинаковые карточки подряд не различить.
                  const label =
                    allInvoices.length > 1
                      ? `Счёт ${invoiceIdx + 1} из ${allInvoices.length}${invoice.sourceFile ? `: ${invoice.sourceFile.fileName}` : ''}`
                      : null;
                  const summary = (
                    <div className="text-ink">
                      {invoice.price != null ? `${invoice.price} ${invoice.currency ?? ''}`.trim() : 'Сумма не распознана'}
                      {invoice.items.length > 0 && ` · ${invoice.items.length} ${pluralPositions(invoice.items.length)}`}
                    </div>
                  );
                  return applied ? (
                    <div
                      key={invoice.sourceFile?.url ?? invoiceIdx}
                      className="flex flex-col gap-2 rounded-control border border-success/40 bg-success/5 p-3 text-sm"
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-ink">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        Счёт распознан и записан в базу автоматически
                      </div>
                      {label && <div className="text-xs text-ink-muted">{label}</div>}
                      {summary}
                      <div className="flex flex-wrap items-center gap-2">
                        {invoice.sourceFile && (
                          <Button
                            type="button"
                            variant="secondary"
                            icon={<Eye className="h-4 w-4" />}
                            onClick={() => openPreview(invoice.sourceFile!)}
                          >
                            Сверить позиции со сметой
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleUndoAutoExtraction(e, invoice)}
                          disabled={applyingExtraction}
                        >
                          Это не счёт — убрать из базы
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={invoice.sourceFile?.url ?? invoiceIdx}
                      className="flex flex-col gap-2 rounded-control border border-border-strong bg-surface-muted p-3 text-sm"
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-ink">
                        <FileSearch className="h-4 w-4 text-ink-muted" />
                        Похоже, это счёт от {offer.name}
                      </div>
                      {label && <div className="text-xs text-ink-muted">{label}</div>}
                      {summary}
                      {invoice.sourceFile ? (
                        <Button
                          type="button"
                          icon={<Eye className="h-4 w-4" />}
                          className="w-fit"
                          onClick={() => openPreview(invoice.sourceFile!)}
                        >
                          Посмотреть и подтвердить
                        </Button>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            icon={<CheckCircle2 className="h-4 w-4" />}
                            onClick={() => handleConfirmAutoExtraction(e, invoice)}
                            disabled={applyingExtraction}
                          >
                            Подтвердить и заполнить карточку
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleDismissAutoExtraction(e, invoice)}
                            disabled={applyingExtraction}
                          >
                            Это не счёт
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="whitespace-pre-wrap text-ink">{visible}</div>
                {quoted && (
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => toggleQuoteExpanded(e.id)}
                      className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink"
                    >
                      {isQuoteExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {isQuoteExpanded ? 'Скрыть историю переписки' : 'Показать историю переписки'}
                    </button>
                    {isQuoteExpanded && (
                      <div className="mt-1 whitespace-pre-wrap border-l-2 border-border pl-2 text-ink-faint">{quoted}</div>
                    )}
                  </div>
                )}
                {/* Владелец, 2026-09-03: "форма пустого письма не нужна, лучше
                    сделай саму кнопку Ответить побольше" — обычная кнопка
                    вместо мелкой текстовой ссылки. Тем же днём, доработка:
                    "кнопка Ответить нужна только на последнем письме" —
                    на более старых письмах треда её теперь нет. */}
                {isLatest && (
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<Reply className="h-4 w-4" />}
                    onClick={() => handleReplyTo(e)}
                    className="mt-1 w-fit"
                  >
                    Ответить
                  </Button>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {!offer.email ? (
        <p className="text-sm text-ink-faint">У предложения не указан email — добавьте его через «Редактировать», чтобы писать отсюда.</p>
      ) : !composerOpen ? null : (
        <div ref={composerRef} className="flex flex-col gap-2 border-t border-border pt-3">
          {orderedTemplates.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-muted">Шаблон</span>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-ink-faint" />
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handlePickTemplate(e.target.value)}
                  className="flex-1 rounded-control border border-transparent bg-surface-muted px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
                >
                  <option value="">Без шаблона</option>
                  {orderedTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <Input label="Тема" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea label="Сообщение" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />

          {/* Владелец, 2026-09-10: "как в обычном email-ящике: нажал
              ответить, оно сохранило всю переписку под катом, а сверху уже
              пишешь ответ свой" — цитата письма, на которое отвечаем,
              показана отдельным свёрнутым блоком под полем "Сообщение", не
              смешана с тем, что печатает пользователь (см. quotedReplyText).
              Разворачивается тем же паттерном, что и цитаты внутри самих
              писем выше (toggleQuoteExpanded). Крестик снимает цитирование
              вовсе — письмо уйдёт без истории, если она не нужна. */}
          {quotedReplyText && (
            <div className="flex flex-col gap-1 rounded-control border border-border bg-surface-muted p-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setQuotedReplyExpanded((v) => !v)}
                  className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink"
                >
                  {quotedReplyExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {quotedReplyExpanded ? 'Скрыть историю переписки' : 'Показать историю переписки'}
                </button>
                <button
                  type="button"
                  onClick={() => setQuotedReplyText(null)}
                  aria-label="Не прикреплять историю переписки к ответу"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {quotedReplyExpanded && (
                <div className="whitespace-pre-wrap border-l-2 border-border pl-2 text-xs text-ink-faint">{quotedReplyText}</div>
              )}
            </div>
          )}

          {/* Владелец, 2026-09-03: "функционал прикрепления ведомостей
              материалов к письму" — ведомость выбирается/собирается в
              отдельной модалке (готовый пресет или позиции запроса), здесь
              только чип уже выбранной (с возможностью снять) и кнопка
              открытия модалки. Реально уходит вместе с письмом только на
              "Отправить" (см. handleSend) — здесь просто черновик вложения. */}
          {pendingLedger ? (
            <div className="flex w-fit items-center gap-2 rounded-control border border-border bg-surface-muted px-3 py-1.5 text-sm text-ink">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-ink-faint" />
              {pendingLedger.fileName}
              <button
                type="button"
                onClick={() => setPendingLedger(null)}
                aria-label="Убрать вложенную ведомость"
                className="flex h-5 w-5 items-center justify-center rounded-full text-ink-faint hover:text-danger"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              icon={<FileSpreadsheet className="h-4 w-4" />}
              className="w-fit"
              onClick={() => setLedgerModalOpen(true)}
            >
              Прикрепить ведомость
            </Button>
          )}

          {/* Владелец, 2026-09-10: "мне нужна возможность прикреплять файлы
              к письму: картинки, таблицы, не ограничивай форматы лучше. Как
              прикрепить ведомость, только кнопка Прикрепить файл" — обычный
              файловый инпут без accept (любой формат), можно выбрать сразу
              несколько; каждый выбранный файл — своя пилюля с крестиком,
              список растёт при повторном клике (не заменяет уже выбранные).
              Реально уходят вместе с письмом только на "Отправить" (см.
              handleSend) — здесь только черновик вложений. */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFilesPicked(e.target.files);
              e.target.value = '';
            }}
          />
          {manualAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {manualAttachments.map((att, i) => (
                <div
                  key={`${att.fileName}-${i}`}
                  className="flex w-fit items-center gap-2 rounded-control border border-border bg-surface-muted px-3 py-1.5 text-sm text-ink"
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="max-w-[220px] truncate">{att.fileName}</span>
                  <button
                    type="button"
                    onClick={() => removeManualAttachment(i)}
                    aria-label={`Убрать вложение ${att.fileName}`}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="secondary"
            icon={<Paperclip className="h-4 w-4" />}
            className="w-fit"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachingFiles}
          >
            {attachingFiles ? 'Прикрепляем...' : 'Прикрепить файл'}
          </Button>

          {/* Владелец, 2026-09-06: "пусть это будет видно в интерфейсе, что
              она прикреплена" — карточка организации прикладывается
              автоматически к первому письму поставщику (isFirstOutgoingToOffer
              выше), чип показывает это до отправки и даёт снять галочку на
              конкретное письмо. Ко второму и последующим письмам того же
              поставщика чип просто не появляется — attachOrgCard уже false. */}
          {attachOrgCard && legalEntity?.cardFile && (
            <div className="flex w-fit items-center gap-2 rounded-control border border-border bg-surface-muted px-3 py-1.5 text-sm text-ink">
              <Paperclip className="h-4 w-4 shrink-0 text-ink-faint" />
              {legalEntity.cardFile.fileName}
              <span className="text-xs text-ink-faint">
                (первое письмо — юрлицо «{legalEntity.shortName || legalEntity.name}», прикрепится автоматически)
              </span>
              <button
                type="button"
                onClick={() => setSkipOrgCard(true)}
                aria-label="Не прикреплять карточку организации к этому письму"
                className="flex h-5 w-5 items-center justify-center rounded-full text-ink-faint hover:text-danger"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {attachDeliveryInfo && legalEntity?.deliveryFile && (
            <div className="flex w-fit items-center gap-2 rounded-control border border-border bg-surface-muted px-3 py-1.5 text-sm text-ink">
              <Paperclip className="h-4 w-4 shrink-0 text-ink-faint" />
              {legalEntity.deliveryFile.fileName}
              <span className="text-xs text-ink-faint">(условия доставки, прикрепится автоматически)</span>
              <button
                type="button"
                onClick={() => setSkipDeliveryInfo(true)}
                aria-label="Не прикреплять адрес доставки к этому письму"
                className="flex h-5 w-5 items-center justify-center rounded-full text-ink-faint hover:text-danger"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {isFirstOutgoingToOffer(emails, offer.id) && !skipOrgCard && legalEntity && !legalEntity.cardFile && (
            <p className="text-xs text-ink-faint">
              Юрлицо категории — «{legalEntity.shortName || legalEntity.name}», но карточка организации для него ещё не
              загружена (Документы → Юрлица) — письмо уйдёт без неё.
            </p>
          )}

          {sendError && <p className="text-sm text-danger">{sendError}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setComposerOpen(false);
                setQuotedReplyText(null);
                setQuotedReplyExpanded(false);
                setManualAttachments([]);
              }}
              disabled={sending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={<Save className="h-4 w-4" />}
              onClick={() => setSaveTemplateOpen(true)}
              disabled={!subject.trim() && !body.trim()}
            >
              Сохранить как шаблон
            </Button>
            <Button type="button" icon={<Send className="h-4 w-4" />} onClick={handleSend} disabled={!body.trim() || sending}>
              {sending ? 'Отправляем...' : 'Отправить'}
            </Button>
          </div>
        </div>
      )}

      <TemplateFormModal
        open={saveTemplateOpen}
        template={null}
        requests={requests}
        initialSubject={subject}
        initialBody={body}
        onClose={() => setSaveTemplateOpen(false)}
        onSaved={onTemplateSaved}
      />

      <MaterialLedgerModal
        open={ledgerModalOpen}
        requestItems={[]}
        allMaterials={allMaterials}
        ledgers={ledgers}
        onClose={() => setLedgerModalOpen(false)}
        onLedgersChange={onLedgersChange}
        onAttach={setPendingLedger}
      />

      <DocumentPreviewModal
        file={previewFile}
        onClose={closePreview}
        wideFooter
        footer={
          previewExtraction && (
            <div className="flex flex-col gap-3 border-t border-border pt-3 text-sm sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
              <div className="flex items-center gap-1.5 font-semibold text-ink">
                <FileSearch className="h-4 w-4 text-ink-muted" />
                Распознанные позиции
              </div>

              {previewExtraction.invoice.items.length === 0 ? (
                <div className="text-ink">
                  {previewExtraction.invoice.price != null
                    ? `${previewExtraction.invoice.price} ${previewExtraction.invoice.currency ?? ''}`.trim()
                    : 'Сумма не распознана'}
                </div>
              ) : (
                <>
                  {/* Владелец, 2026-09-03: "давай зашивать лучшие цены на
                      позиции... давай сверять вручную" — для сравнения цен
                      между поставщиками (даже если предложена другая
                      марка/модель того же материала — "альтернатива")
                      нужен общий ключ, sourceMaterialId. Сама модель не
                      знает, какому материалу сметы соответствует
                      распознанная строка счёта — сопоставление ручное, с
                      подсказкой по схожести названия (suggestMaterialMatch). */}
                  <div className="flex flex-col gap-2">
                    {previewExtraction.invoice.items.map((it, idx) => {
                      const match = materialMatches[idx];
                      const material = match?.materialId
                        ? allMaterials.find((m) => m.item.sourceMaterialId === match.materialId)
                        : undefined;
                      // Владелец, 2026-09-04: "краска идёт в литрах, а
                      // поставщик выставляет банки по X литров... надо
                      // пересчитывать на литр, а не в целом" — тара счёта
                      // (it.unit) и единица сметы (material.item.unit) может
                      // не совпадать, показываем обе явно, чтобы было видно,
                      // когда пересчёт обязателен.
                      const unitMismatch = !!material && !!it.unit && !!material.item.unit && it.unit.trim().toLowerCase() !== material.item.unit.trim().toLowerCase();
                      return (
                        <div key={idx} className="flex flex-col gap-1.5 rounded-control border border-border p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 flex-1 font-medium text-ink">{it.name}</span>
                            <span className="shrink-0 text-xs text-ink-muted">
                              {it.quantity ?? '—'} {it.unit}
                              {it.price != null && (
                                <>
                                  {' · '}
                                  {it.price} {previewExtraction.invoice.currency ?? ''}
                                </>
                              )}
                            </span>
                          </div>
                          <select
                            value={match?.kind === 'delivery' ? '__delivery' : (match?.materialId ?? '')}
                            onChange={(e) => {
                              const value = e.target.value;
                              setMaterialMatches((prev) => {
                                const cur = prev[idx] ?? emptyMatch();
                                if (value === '__delivery') return { ...prev, [idx]: { ...cur, materialId: '', unitPrice: '', kind: 'delivery' } };
                                return {
                                  ...prev,
                                  [idx]: {
                                    ...cur,
                                    materialId: value,
                                    unitPrice: value ? computeUnitPriceGuess(it, value, allMaterials) : '',
                                    kind: cur.kind === 'delivery' ? 'exact' : cur.kind,
                                  },
                                };
                              });
                            }}
                            className="rounded-control border border-transparent bg-surface-muted px-2 py-1.5 text-xs text-ink outline-none focus:border-primary"
                          >
                            <option value="">Не сопоставлено с материалом сметы</option>
                            <option value="__delivery">Доставка / транспорт (не материал)</option>
                            {allMaterials
                              .filter((m) => m.item.sourceMaterialId)
                              .map((m) => (
                                <option key={m.item.sourceMaterialId} value={m.item.sourceMaterialId!}>
                                  {m.item.name} ({m.context})
                                </option>
                              ))}
                          </select>
                          {material && (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  placeholder="0"
                                  value={match?.unitPrice ?? ''}
                                  onChange={(e) =>
                                    setMaterialMatches((prev) => ({
                                      ...prev,
                                      [idx]: { ...(prev[idx] ?? emptyMatch(match!.materialId)), unitPrice: e.target.value },
                                    }))
                                  }
                                  className="w-28 rounded-control border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary"
                                />
                                <span className="text-xs text-ink-muted">
                                  {previewExtraction.invoice.currency ?? ''} за {material.item.unit || 'ед.'} сметы, с НДС
                                </span>
                                {/* Владелец, 2026-09-15: у МаксиКерам цены в строках без НДС, итог с НДС 22% — без пересчёта поставщик выглядел бы на 22% дешевле. */}
                                {match?.unitPrice && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMaterialMatches((prev) => ({
                                        ...prev,
                                        [idx]: { ...prev[idx], unitPrice: String(Math.round(Number(prev[idx].unitPrice) * 1.22 * 100) / 100) },
                                      }))
                                    }
                                    className="text-xs font-medium text-primary-hover hover:underline"
                                    title="Если в счёте цены без НДС — умножить на 1,22"
                                  >
                                    +22% НДС
                                  </button>
                                )}
                              </div>
                              {/* Владелец, 2026-09-15: «Грильято прислал аналог и получил бейдж лучшей цены» / керамогранит — ровно по артикулам ответил один из пяти. Вид соответствия и пометка живут рядом с ценой в сравнении, ссылка — на карточку товара (из письма менеджера или с сайта). */}
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={match?.kind ?? 'exact'}
                                  onChange={(e) =>
                                    setMaterialMatches((prev) => ({ ...prev, [idx]: { ...prev[idx], kind: e.target.value as PurchaseItemMatchKind } }))
                                  }
                                  className="rounded-control border border-border bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-primary"
                                >
                                  {(['exact', 'alternative', 'check'] as const).map((k) => (
                                    <option key={k} value={k}>
                                      {PURCHASE_ITEM_MATCH_KIND_LABELS[k]}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  placeholder="Чем отличается: «Мурал вместо Urban Home», «20 мм вместо 9»"
                                  value={match?.note ?? ''}
                                  onChange={(e) => setMaterialMatches((prev) => ({ ...prev, [idx]: { ...prev[idx], note: e.target.value } }))}
                                  className="min-w-0 flex-1 rounded-control border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary"
                                />
                              </div>
                              <input
                                type="url"
                                placeholder="Ссылка на карточку товара (из письма менеджера или с сайта)"
                                value={match?.productUrl ?? ''}
                                onChange={(e) => setMaterialMatches((prev) => ({ ...prev, [idx]: { ...prev[idx], productUrl: e.target.value } }))}
                                className="rounded-control border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary"
                              />
                              {unitMismatch && (
                                <p className="text-xs text-warning">
                                  На счёте — {it.unit || 'без единицы'}, в смете — {material.item.unit || 'без единицы'}. Посчитайте цену за{' '}
                                  {material.item.unit || 'единицу сметы'} вручную (сколько {material.item.unit || 'ед.'} в одной таре поставщика).
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-ink-faint">
                    Сопоставьте позиции с материалами сметы и укажите цену за единицу сметы с НДС (не за тару поставщика).
                    Отметьте, ровно ли это то, что просили, или аналог, и дайте ссылку на карточку — так во вкладке «Сравнение
                    цен» позиции ведомости сравниваются между поставщиками честно, а руководитель видит, что именно предлагают.
                  </p>
                </>
              )}

              {extractionError && <p className="text-sm text-danger">{extractionError}</p>}
              {/* Автозаписанный счёт уже в базе — подтверждать нечего,
                  сохраняется только сопоставление позиций со сметой.
                  Старый путь (status:'pending') остаётся для писем, по
                  которым автозапись не прошла: сервис распознавания был
                  недоступен или запись в карточку сорвалась. */}
              {autoApplied(previewExtraction.email, previewExtraction.invoice) ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-ink-faint">
                    Цена и позиции этого счёта записаны в карточку автоматически, когда письмо пришло. Сверка со сметой —
                    необязательный шаг: без неё позиции просто не участвуют в сравнении цен по материалам.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      icon={<Save className="h-4 w-4" />}
                      onClick={() => handleSaveMaterialMatches(previewExtraction.email, previewExtraction.invoice)}
                      disabled={applyingExtraction}
                    >
                      Сохранить сопоставление
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleUndoAutoExtraction(previewExtraction.email, previewExtraction.invoice)}
                      disabled={applyingExtraction}
                    >
                      Это не счёт — убрать из базы
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={() => handleConfirmAutoExtraction(previewExtraction.email, previewExtraction.invoice)}
                    disabled={applyingExtraction}
                  >
                    Подтвердить и заполнить карточку
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleDismissAutoExtraction(previewExtraction.email, previewExtraction.invoice)}
                    disabled={applyingExtraction}
                  >
                    Это не счёт
                  </Button>
                </div>
              )}
            </div>
          )
        }
      />
    </div>
  );
}

type ThreadStatus = 'unread' | 'sent' | 'replied' | 'none';

// Владелец не хранится нигде отдельно — статус всегда пересчитывается из
// самой переписки (см. EMAIL_CORRESPONDENCE_PLAN.md, этап 2): "Не писали"
// (писем нет), "Отправлено" (есть исходящее, ответа нет), "Ответили"
// (последнее письмо входящее — unread красным счётчиком поверх статуса,
// если ещё не открывали тред).
function threadStatus(emails: SupplierOfferEmail[]): { status: ThreadStatus; unreadCount: number } {
  const unreadCount = emails.filter((e) => e.direction === 'in' && !e.readAt).length;
  if (emails.length === 0) return { status: 'none', unreadCount: 0 };
  const last = emails[emails.length - 1];
  if (unreadCount > 0) return { status: 'unread', unreadCount };
  return { status: last.direction === 'in' ? 'replied' : 'sent', unreadCount: 0 };
}

const STATUS_LABEL: Record<ThreadStatus, string> = {
  none: 'Не писали',
  sent: 'Отправлено',
  replied: 'Ответили',
  unread: 'Ответили',
};

const STATUS_CLASS: Record<ThreadStatus, string> = {
  none: 'text-ink-faint',
  sent: 'text-ink-muted',
  replied: 'text-success',
  unread: 'text-success',
};

interface RequestGroup {
  request: SupplierRequest;
  offers: { offer: SupplierOffer; emails: SupplierOfferEmail[] }[];
}

// includeUnverified — только для псевдо-категории "Непрочитанные"
// (владелец, 2026-09-14: "нужно вывести все непрочитанные сообщения на
// 1 страницу, даже если поставщики ещё не верифицированы, это мои прежние
// запросы и на них нужно ответить"). Обычные категории по-прежнему
// показывают только верифицированных с email.
function buildGroups(
  requests: SupplierRequest[],
  offers: SupplierOffer[],
  emails: SupplierOfferEmail[],
  includeUnverified: boolean,
): RequestGroup[] {
  const byRequest = new Map<string, RequestGroup>();
  for (const request of requests) {
    byRequest.set(request.id, { request, offers: [] });
  }
  for (const offer of offers) {
    // Владелец, 2026-09-04: "поставщик добавлен из поиска — статус
    // Требуется верификация... заполнил поля, сохранил — доступен для
    // переписки" — до тех пор скрыт так же, как и предложения без email
    // (некому/нельзя писать).
    if (!includeUnverified && (!offer.email || !offer.verified)) continue;
    const group = byRequest.get(offer.requestId);
    if (!group) continue;
    const offerEmails = emails.filter((e) => e.offerId === offer.id);
    group.offers.push({ offer, emails: offerEmails });
  }
  const withSortedOffers = [...byRequest.values()]
    .filter((g) => g.offers.length > 0)
    .map((g) => ({
      ...g,
      offers: g.offers.sort((a, b) => {
        const sa = threadStatus(a.emails);
        const sb = threadStatus(b.emails);
        if (sa.unreadCount !== sb.unreadCount) return sb.unreadCount - sa.unreadCount;
        const lastA = a.emails[a.emails.length - 1]?.createdAt ?? '';
        const lastB = b.emails[b.emails.length - 1]?.createdAt ?? '';
        if (lastA !== lastB) return lastB.localeCompare(lastA);
        return a.offer.name.localeCompare(b.offer.name, 'ru');
      }),
    }));
  // Владелец, 2026-09-03: "поднимай непрочитанные письма и поставщиков с
  // ними в левом боковом меню в верх списка" — сортировка offers внутри
  // группы (выше) уже поднимала поставщика наверх ВНУТРИ своего запроса,
  // но сами запросы (категории) шли в исходном порядке. Теперь категория
  // с хотя бы одним непрочитанным письмом целиком поднимается над
  // категориями без непрочитанных — .sort() в JS стабилен, поэтому
  // порядок внутри одинакового unread-счёта не меняется.
  return withSortedOffers.sort((a, b) => {
    const unreadA = a.offers.reduce((sum, x) => sum + threadStatus(x.emails).unreadCount, 0);
    const unreadB = b.offers.reduce((sum, x) => sum + threadStatus(x.emails).unreadCount, 0);
    return unreadB - unreadA;
  });
}


// Слева — дерево Запрос → Поставщик (только те, у кого есть email — писать
// больше некому), справа — тред выбранного. Владелец, 2026-09-03: "точно
// нужна группировка по подрядчику, метка с категорией... ну и сама
// группировка по этому тегу" — категория тут это сам запрос Ресерча
// (согласовано отдельно, см. EMAIL_CORRESPONDENCE_PLAN.md п.0), второго
// поля-тега не заводили.
export function SupplierCorrespondenceTab({
  requests,
  offers,
  orders,
  emails,
  templates,
  ledgers,
  allMaterials,
  legalEntities,
  templatesModalOpen,
  onCloseTemplatesModal,
  onOpenBulkSend,
  onEmailSent,
  onMarkRead,
  onTemplatesChange,
  onLedgersChange,
  onOfferUpdated,
  onReliabilityChecked,
  reliabilityByInn,
  onOrdersChange,
  onEmailUpdated,
  onQuotesChange,
  pendingAutoReplies,
  onAutoReplyReviewed,
}: {
  requests: SupplierRequest[];
  offers: SupplierOffer[];
  // Владелец, 2026-09-03: "1 заявка на поставку — одна ветка" — доп. заявки
  // всех поставщиков разом, группировка по offerId — на месте (см.
  // offerOrders ниже), тот же принцип, что и у offers/emails.
  orders: SupplierOrder[];
  emails: SupplierOfferEmail[];
  templates: EmailTemplate[];
  ledgers: MaterialLedger[];
  allMaterials: { item: PurchaseItem; context: string }[];
  legalEntities: LegalEntity[];
  // Владелец, 2026-09-04: "перенеси Шаблоны направо, на уровень меню
  // Поставщики/Письма, но видно только на Письмах" — кнопка теперь в шапке
  // страницы (Suppliers.tsx), тут только сама модалка, открытость приходит
  // снаружи.
  templatesModalOpen: boolean;
  onCloseTemplatesModal: () => void;
  // Владелец, 2026-09-04: "давай реализуем массовую отправку... Альмира
  // сформировала универсальную ведомость и хочет разослать её нескольким
  // поставщикам" — сам мастер (выбор ведомости → получатели → отправка)
  // живёт в Suppliers.tsx (не размонтируется при переключении вкладок,
  // рассылка переживает уход с "Письма" на другую вкладку страницы), тут
  // только кнопка-триггер на уровне выбранной категории.
  onOpenBulkSend: (request: SupplierRequest) => void;
  onEmailSent: (email: SupplierOfferEmail) => void;
  onMarkRead: (offerId: string, orderId: string | null) => void;
  onTemplatesChange: (templates: EmailTemplate[]) => void;
  onLedgersChange: (ledgers: MaterialLedger[]) => void;
  onOfferUpdated: (offer: SupplierOffer) => void;
  onReliabilityChecked: (r: SupplierReliability) => void;
  reliabilityByInn: Map<string, SupplierReliability>;
  onOrdersChange: (orders: SupplierOrder[]) => void;
  onEmailUpdated: (email: SupplierOfferEmail) => void;
  onQuotesChange: (update: (prev: SupplierQuote[]) => SupplierQuote[]) => void;
  // Черновики автоответов на проверку — грузятся один раз на странице
  // (Suppliers.tsx), тут только проброс в открытый тред.
  pendingAutoReplies: EmailAutoReplyLogEntry[];
  onAutoReplyReviewed: (id: string) => void;
}) {
  // Владелец, 2026-09-04: "сидишь на странице конкретной переписки,
  // обновляешь — и всё слетело... кастомный урл даже на переписки с
  // поставщиками" — категория/поставщик/заявка живут в URL
  // (?category=...&offer=...&order=...), не в локальном стейте: F5 больше
  // не сбрасывает открытый тред. order отсутствует в URL — открыта
  // "основная" переписка офера (null), не отдельная заявка.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRequestId = searchParams.get('category');
  const selectedOfferId = searchParams.get('offer');
  const selectedOrderId = searchParams.get('order');

  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);
  const [newOrderTitle, setNewOrderTitle] = useState('');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  // Владелец, 2026-09-03: "добавляй ещё один селектор после категории с
  // выбором страны, не такой же выпадающий, а просто два варианта, указывай
  // флагами" — фильтрует список поставщиков категории ниже, не глобальный
  // выбор (тред уже выбранного поставщика остаётся открытым при переключении).
  const [countryFilter, setCountryFilter] = useState<string>(SUPPLIER_COUNTRIES[0]);

  function handleTemplateSaved(saved: EmailTemplate) {
    onTemplatesChange(templates.some((t) => t.id === saved.id) ? templates.map((t) => (t.id === saved.id ? saved : t)) : [...templates, saved]);
  }

  const groups = useMemo<RequestGroup[]>(() => buildGroups(requests, offers, emails, false), [requests, offers, emails]);
  // Надмножество groups: то же самое плюс неверифицированные (и без email).
  // Используется ТОЛЬКО в псевдо-категории "Непрочитанные" и при поиске
  // открытого треда — чтобы на старое письмо можно было ответить, не
  // дожидаясь верификации поставщика.
  const allGroups = useMemo<RequestGroup[]>(() => buildGroups(requests, offers, emails, true), [requests, offers, emails]);

  // Владелец, 2026-09-04: "ответы будут приходить неравномерно, в разные
  // категории... непрочитанные письма должны быть сразу видны" —
  // псевдо-категория "Непрочитанные" первым пунктом селектора: плоский
  // список ВСЕХ тредов (основных и заявок) с непрочитанными письмами по
  // всем категориям разом, с подписью категории/заявки на каждой строке,
  // отсортирован по свежести последнего письма.
  interface UnreadEntry {
    requestId: string;
    requestTitle: string;
    offer: SupplierOffer;
    orderId: string | null;
    orderTitle: string | null;
    unreadCount: number;
    lastAt: string;
  }

  const unreadEntries = useMemo<UnreadEntry[]>(() => {
    const list: UnreadEntry[] = [];
    for (const group of allGroups) {
      for (const { offer, emails: offerEmails } of group.offers) {
        const threads: { id: string | null; title: string | null }[] = [
          { id: null, title: null },
          ...orders.filter((o) => o.offerId === offer.id).map((o) => ({ id: o.id, title: o.title || 'Без названия' })),
        ];
        for (const t of threads) {
          const threadEmails = offerEmails.filter((e) => (e.orderId ?? null) === t.id);
          const { unreadCount } = threadStatus(threadEmails);
          if (unreadCount === 0) continue;
          list.push({
            requestId: group.request.id,
            requestTitle: group.request.title,
            offer,
            orderId: t.id,
            orderTitle: t.title,
            unreadCount,
            lastAt: threadEmails[threadEmails.length - 1]?.createdAt ?? '',
          });
        }
      }
    }
    return list.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [allGroups, orders]);

  const totalUnread = unreadEntries.reduce((sum, e) => sum + e.unreadCount, 0);

  // Текущая выбранная категория — если ещё ничего не выбрано (или ссылка
  // осиротела, например запрос удалили), по умолчанию открываем
  // "Непрочитанные", если там есть что показать, иначе первую категорию
  // списка (уже отсортирована по непрочитанным — см. groups выше).
  const effectiveRequestId =
    selectedRequestId && (selectedRequestId === 'unread' ? totalUnread > 0 : groups.some((g) => g.request.id === selectedRequestId))
      ? selectedRequestId
      : totalUnread > 0
        ? 'unread'
        : (groups[0]?.request.id ?? null);
  const isUnreadView = effectiveRequestId === 'unread';
  const selectedGroup = groups.find((g) => g.request.id === effectiveRequestId) ?? null;

  const categoryOptions = useMemo(() => {
    const base = groups.map((g) => {
      const unread = g.offers.reduce((sum, x) => sum + threadStatus(x.emails).unreadCount, 0);
      return { id: g.request.id, label: unread > 0 ? `${g.request.title} (${unread})` : g.request.title };
    });
    return totalUnread > 0 ? [{ id: 'unread', label: `Непрочитанные (${totalUnread})` }, ...base] : base;
  }, [groups, totalUnread]);

  const selected = useMemo(() => {
    if (!selectedOfferId) return null;
    for (const group of allGroups) {
      const found = group.offers.find((x) => x.offer.id === selectedOfferId);
      if (found) return { ...found, request: group.request };
    }
    return null;
  }, [allGroups, selectedOfferId]);

  // Заявки выбранного поставщика — "Основная" (null) всегда в списке
  // неявно (см. чипы ниже), тут только дополнительные (SupplierOrder).
  const offerOrders = useMemo(
    () => (selected ? orders.filter((o) => o.offerId === selected.offer.id) : []),
    [orders, selected],
  );
  const selectedOrder = selectedOrderId ? offerOrders.find((o) => o.id === selectedOrderId) ?? null : null;

  function selectOffer(offerId: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('offer', offerId);
        params.delete('order');
        return params;
      },
      { replace: true },
    );
    onMarkRead(offerId, null);
  }

  // Смена категории сбрасывает выбранного поставщика — иначе справа
  // остался бы висеть тред поставщика из уже скрытой категории.
  function selectCategory(requestId: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('category', requestId);
        params.delete('offer');
        params.delete('order');
        return params;
      },
      { replace: true },
    );
  }

  // Владелец, 2026-09-03: "1 заявка на поставку — одна ветка" — переключение
  // между "Основная"/заявками того же поставщика, отметка прочитанным идёт
  // именно за этот тред, не за всю переписку с поставщиком разом (иначе
  // непрочитанные в других заявках гасли бы, даже не будучи открытыми).
  function selectOrder(orderId: string | null) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (orderId) params.set('order', orderId);
        else params.delete('order');
        return params;
      },
      { replace: true },
    );
    if (selectedOfferId) onMarkRead(selectedOfferId, orderId);
  }

  // Клик по строке в псевдо-категории "Непрочитанные" — сразу открывает
  // нужный тред нужного поставщика, category в URL уже 'unread'.
  function selectUnreadEntry(entry: UnreadEntry) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('category', 'unread');
        params.set('offer', entry.offer.id);
        if (entry.orderId) params.set('order', entry.orderId);
        else params.delete('order');
        return params;
      },
      { replace: true },
    );
    onMarkRead(entry.offer.id, entry.orderId);
  }

  function openNewOrderModal() {
    setNewOrderTitle('');
    setOrderError(null);
    setNewOrderModalOpen(true);
  }

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOfferId || !newOrderTitle.trim() || creatingOrder) return;
    setCreatingOrder(true);
    setOrderError(null);
    try {
      const created = await insertSupplierOrder({
        offerId: selectedOfferId,
        title: newOrderTitle.trim(),
        communicationStatus: '',
        price: 0,
        currency: 'USD',
        deadline: '',
        requirements: '',
        items: [],
        files: [],
      });
      onOrdersChange([...orders, created]);
      setNewOrderModalOpen(false);
      selectOrder(created.id);
    } catch (err) {
      setOrderError(errorMessage(err, 'Не удалось создать заявку'));
    } finally {
      setCreatingOrder(false);
    }
  }

  function handleOrderUpdated(updated: SupplierOrder) {
    onOrdersChange(orders.map((o) => (o.id === updated.id ? updated : o)));
  }

  const templatesModal = (
    <TemplateManagerModal
      open={templatesModalOpen}
      templates={templates}
      requests={requests}
      onClose={onCloseTemplatesModal}
      onChange={onTemplatesChange}
    />
  );

  if (groups.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="py-10 text-center text-sm text-ink-muted">
          Пока не с кем переписываться — у предложений в Ресерче ещё нет email, или запросов вовсе нет.
        </Card>
        {templatesModal}
      </div>
    );
  }

  return (
    // Владелец, 2026-09-10: "весь блок письма должен быть виден на экране,
    // вне зависимости от экрана... даже если список поставщиков как-то
    // скроется" — цепочка roomy:flex-1 вниз до EmailThread не растягивает
    // список поставщиков поверх экрана, а даёт ему свою прокрутку (см. ниже),
    // композер письма остаётся всегда видимым целиком.
    // Вне roomy (узкое ИЛИ невысокое окно — правка 2026-09-11) — как было до
    // 2026-09-10: обычная прокрутка страницы, ничего не ужимается.
    <div className="flex flex-col gap-4 roomy:min-h-0 roomy:flex-1">
      <div className="flex flex-col gap-4 lg:flex-row roomy:min-h-0 roomy:flex-1">
        <div className="flex flex-col gap-3 lg:w-80 lg:shrink-0 roomy:min-h-60">
          <Select
            label="Категория"
            options={categoryOptions.map((o) => o.label)}
            value={categoryOptions.find((o) => o.id === effectiveRequestId)?.label ?? ''}
            onChange={(label) => {
              const o = categoryOptions.find((x) => x.label === label);
              if (o) selectCategory(o.id);
            }}
          />

          {/* Владелец, 2026-09-03: "не такой же выпадающий [как Категория],
              а просто два варианта, указывай флагами" — компактный тумблер
              из двух кнопок-флагов, не Select. Фильтрует список поставщиков
              ниже по стране (та же логика fallback на первую страну списка
              для записей без country, что и в RequestCard на Suppliers.tsx).
              Владелец, 2026-09-04: в псевдо-категории "Непрочитанные" список
              и так уже смешивает все категории/страны — тумблер тут ни при
              чём, скрыт. */}
          {!isUnreadView && (
            <div className="flex w-fit gap-1 rounded-full border border-border bg-surface-muted p-1">
              {SUPPLIER_COUNTRIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => setCountryFilter(c)}
                  className={cn(
                    'flex h-8 w-11 items-center justify-center rounded-full text-base transition-colors',
                    countryFilter === c ? 'bg-surface shadow-card' : 'opacity-50 hover:opacity-100',
                  )}
                >
                  {countryFlag(c)}
                </button>
              ))}
            </div>
          )}

          {/* Владелец, 2026-09-04: "давай реализуем массовую отправку" —
              рассылка одной и той же ведомости нескольким поставщикам
              выбранной категории разом. Не показываем в псевдо-категории
              "Непрочитанные" (это не настоящая категория, там смешаны
              поставщики из разных запросов) и когда рассылать некому
              (нет ни одного верифицированного предложения с email). */}
          {!isUnreadView && selectedGroup && selectedGroup.offers.some((x) => x.offer.email && x.offer.verified) && (
            <Button
              type="button"
              variant="secondary"
              icon={<Users className="h-4 w-4" />}
              className="w-fit"
              onClick={() => onOpenBulkSend(selectedGroup.request)}
            >
              Массовая отправка
            </Button>
          )}

          {/* Владелец, 2026-09-10: "боковой список поставщиков будет как-то
              скрываться за кнопку" — сюда список не влезал бы полностью,
              поэтому вместо скрытия за кнопкой (список нужен сразу) он
              просто получил свою прокрутку — Select/тумблер страны/кнопка
              рассылки сверху всегда на виду. */}
          <div className="flex flex-col gap-1 roomy:min-h-0 roomy:flex-1 roomy:overflow-y-auto">
            {isUnreadView
              ? unreadEntries.map((entry) => {
                  const key = `${entry.offer.id}:${entry.orderId ?? 'main'}`;
                  const isSelected = selectedOfferId === entry.offer.id && (selectedOrderId ?? null) === entry.orderId;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => selectUnreadEntry(entry)}
                      className={cn(
                        'flex flex-col items-start gap-0.5 rounded-control border px-3 py-2 text-left text-sm transition-colors',
                        isSelected ? 'border-ink bg-surface-muted' : 'border-border bg-surface hover:border-border-strong',
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{entry.offer.name}</span>
                        <RiskBadge inn={entry.offer.inn} reliabilityByInn={reliabilityByInn} />
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                          {entry.unreadCount}
                        </span>
                      </span>
                      <span className="flex w-full min-w-0 items-center gap-1.5 text-xs text-ink-faint">
                        <span className="min-w-0 flex-1 truncate">
                          {entry.requestTitle}
                          {entry.orderTitle ? ` · ${entry.orderTitle}` : ''}
                        </span>
                        {/* Такой поставщик не виден в своей категории (нужна
                            верификация) — без пометки было бы непонятно,
                            почему письмо есть только здесь. */}
                        {!entry.offer.verified && (
                          <span className="shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                            не верифицирован
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              : selectedGroup?.offers
                  .filter(({ offer }) => (offer.country || SUPPLIER_COUNTRIES[0]) === countryFilter)
                  .map(({ offer, emails: offerEmails }) => {
                    const { status, unreadCount } = threadStatus(offerEmails);
                    const isSelected = selectedOfferId === offer.id;
                    return (
                      <button
                        key={offer.id}
                        type="button"
                        onClick={() => selectOffer(offer.id)}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-control border px-3 py-2 text-left text-sm transition-colors',
                          isSelected ? 'border-ink bg-surface-muted' : 'border-border bg-surface hover:border-border-strong',
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{offer.name}</span>
                        <RiskBadge inn={offer.inn} reliabilityByInn={reliabilityByInn} />
                        <span className="flex shrink-0 items-center gap-1.5">
                          {unreadCount > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                              {unreadCount}
                            </span>
                          )}
                          <span className={cn('text-xs', STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>
                        </span>
                      </button>
                    );
                  })}
          </div>
        </div>

        <Card className="flex-1 p-5 roomy:flex roomy:min-h-0 roomy:flex-col roomy:overflow-y-auto">
          {!selected ? (
            <p className="text-sm text-ink-faint">Выберите поставщика слева, чтобы открыть переписку.</p>
          ) : (
            <div className="flex flex-col gap-3 roomy:min-h-0 roomy:flex-1">
              {/* Владелец, 2026-09-03: флаг и бейдж категории убраны отсюда —
                  флаг был лишним (слишком много флагов на экране), категория
                  переехала в блок реквизитов внутри EmailThread. */}
              <span className="text-lg font-bold text-ink">{selected.offer.name}</span>
              <RiskBadge inn={selected.offer.inn} reliabilityByInn={reliabilityByInn} />

              {/* Владелец, 2026-09-03: "1 заявка на поставку — одна ветка" —
                  чипы переключают тред: "Основная" (та переписка, что была
                  всегда) + по одной на каждую доп. заявку. Непрочитанные в
                  каждой заявке считаются отдельно, чтобы было видно, где
                  именно ответили, не открывая все подряд. */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[{ id: null as string | null, title: 'Основная' }, ...offerOrders.map((o) => ({ id: o.id, title: o.title || 'Без названия' }))].map(
                  (t) => {
                    const threadUnread = threadStatus(selected.emails.filter((e) => (e.orderId ?? null) === t.id)).unreadCount;
                    const isActive = (selectedOrderId ?? null) === t.id;
                    return (
                      <button
                        key={t.id ?? 'main'}
                        type="button"
                        onClick={() => selectOrder(t.id)}
                        className={cn(
                          'relative rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                          isActive ? 'border-ink bg-surface-muted text-ink' : 'border-border bg-surface text-ink-muted hover:border-border-strong',
                        )}
                      >
                        {t.title}
                        {threadUnread > 0 && (
                          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                            {threadUnread}
                          </span>
                        )}
                      </button>
                    );
                  },
                )}
                <Button type="button" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={openNewOrderModal}>
                  Новая заявка
                </Button>
              </div>

              <EmailThread
                offer={selected.offer}
                order={selectedOrder}
                request={selected.request}
                requests={requests}
                emails={selected.emails}
                templates={templates}
                ledgers={ledgers}
                allMaterials={allMaterials}
                legalEntities={legalEntities}
                onEmailSent={onEmailSent}
                onTemplateSaved={handleTemplateSaved}
                onLedgersChange={onLedgersChange}
                onOfferUpdated={onOfferUpdated}
                onReliabilityChecked={onReliabilityChecked}
                reliabilityByInn={reliabilityByInn}
                onOrderUpdated={handleOrderUpdated}
                onEmailUpdated={onEmailUpdated}
                onQuotesChange={onQuotesChange}
                pendingAutoReplies={pendingAutoReplies}
                onAutoReplyReviewed={onAutoReplyReviewed}
              />
            </div>
          )}
        </Card>
      </div>
      {templatesModal}

      <Modal open={newOrderModalOpen} onClose={() => setNewOrderModalOpen(false)} title="Новая заявка">
        <form onSubmit={handleCreateOrder} className="flex flex-col gap-4">
          <Input
            label="Название заявки"
            placeholder="Например, Окна"
            value={newOrderTitle}
            onChange={(e) => setNewOrderTitle(e.target.value)}
            required
            autoFocus
          />
          {orderError && <p className="text-sm text-danger">{orderError}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setNewOrderModalOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!newOrderTitle.trim() || creatingOrder}>
              {creatingOrder ? 'Создаём...' : 'Создать'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// Общий счётчик непрочитанных по всей переписке — бейдж поверх вкладки
// "Email" в ToggleGroup (Suppliers.tsx, проп badges).
export function countUnreadSupplierEmails(emails: SupplierOfferEmail[]): number {
  return emails.filter((e) => e.direction === 'in' && !e.readAt).length;
}
