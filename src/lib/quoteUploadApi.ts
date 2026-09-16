import { authFetch } from './authFetch';
import { uploadSupplierFile } from './supplierResearchApi';
import type { DocumentFile } from '../data/contractorDocuments';

// Загрузка КП «в 1 клик» (владелец, 2026-09-16: «чтобы система сама понимала,
// к какой поставке это относится и к какому поставщику»).
//
// Клиент делает ровно два шага: кладёт файл в Storage (тот же бакет и тот же
// uploadSupplierFile, что и у остальных файлов поставщика) и отдаёт серверу
// ссылку. Всё остальное — чтение документа, поиск поставщика, выбор поставки,
// запись КП и сопоставление строк с ведомостью — на сервере
// (api/_invoiceRouting.js): там лежит service-role ключ и там же живёт запись
// счетов, приходящих письмами, а две ветки одного и того же действия
// расходиться не должны.

// Что именно распознал сервер. Тип намеренно «сырой»: клиент эти данные не
// разбирает, а лишь возвращает обратно вторым вызовом, когда человек выбрал
// поставку, — чтобы не гонять один и тот же документ через модель дважды.
export type RecognizedInvoicePayload = Record<string, unknown>;

export interface QuoteRouteCandidate {
  requestId: string;
  requestTitle: string;
  // Карточка поставщика в этой поставке, если она уже есть. null — счёт
  // ляжет в новую карточку, заведённую по реквизитам из документа.
  offerId: string | null;
  supplierName: string | null;
  // Куда указало содержание счёта. Подсказка, а не решение: если бы
  // уверенности хватало, вопроса бы не было вовсе.
  recommended: boolean;
}

export interface QuoteUploadSupplier {
  name: string;
  inn: string;
  email: string;
  site: string;
}

// Чем именно опознан поставщик. 'manual' — выбор человека из кандидатов.
export type QuoteMatchedBy = 'inn' | 'name' | 'site' | 'manual' | null;

export interface QuoteAppliedResult {
  status: 'applied';
  fileName: string;
  offerId: string;
  requestId: string;
  requestTitle: string;
  supplierName: string;
  createdOffer: boolean;
  matchedBy: QuoteMatchedBy;
  routingNote: string;
  quoteId: string | null;
  price: number | null;
  currency: string | null;
  confidence: number | null;
  itemsCount: number;
  // Сколько строк счёта легло на позиции ведомости — ровно они и появятся в
  // «Сравнении цен».
  matchedCount: number;
  // Заведена ли у поставки ведомость (привязан ли раздел сметы). false —
  // сопоставлять не с чем, и это другая новость, чем «строки не совпали».
  hasLedger: boolean;
}

export interface QuoteAmbiguousResult {
  status: 'ambiguous';
  fileName: string;
  recognized: RecognizedInvoicePayload;
  supplier: QuoteUploadSupplier;
  candidates: QuoteRouteCandidate[];
}

export interface QuoteNotInvoiceResult {
  status: 'not_invoice';
  fileName: string;
}

export type QuoteUploadResult = QuoteAppliedResult | QuoteAmbiguousResult | QuoteNotInvoiceResult;

export function uploadQuoteFile(file: File): Promise<DocumentFile> {
  return uploadSupplierFile(file);
}

export async function routeUploadedQuote(input: {
  fileUrl: string;
  fileName: string;
  // Выбор человека, когда автоматика не справилась: карточка поставщика либо
  // поставка, в которой карточку надо завести.
  offerId?: string;
  requestId?: string;
  recognized?: RecognizedInvoicePayload;
}): Promise<QuoteUploadResult> {
  const resp = await authFetch('/api/supplier-web-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upload-quote', ...input }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((data as { error?: string }).error || `Не удалось загрузить КП (${resp.status})`);
  return data as QuoteUploadResult;
}

// Только те расширения, которые реально умеет читать распознавание
// (api/_invoiceRecognition.js). Список держим в одном месте и на клиенте:
// файл, который сервер не сможет открыть, лучше отсеять до загрузки в
// Storage — иначе в бакете копятся файлы, о которых никто не узнает.
export const QUOTE_FILE_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'jfif', 'jpe', 'webp', 'gif', 'docx', 'xlsx'];

export function isQuoteFileName(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return QUOTE_FILE_EXTENSIONS.includes(ext);
}
