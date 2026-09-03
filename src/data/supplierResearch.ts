import type { Currency } from './transactions';
import type { DocumentFile } from './contractorDocuments';
import type { PurchaseItem } from './purchases';
import { RESEARCH_CURRENCIES, RESEARCH_CONTACT_METHODS, type ResearchContactMethod } from './contractorResearch';

// Валюты/способы связи — те же самые списки, что и у "Подрядчики → Ресерч"
// (data/contractorResearch.ts), общие для любого сравнения предложений в
// проекте, поэтому переиспользуются как есть, без дублирования.
export { RESEARCH_CURRENCIES, RESEARCH_CONTACT_METHODS };
export type { ResearchContactMethod };

// Вкладка "Поставщики" (пункт меню "Стройка") — та же механика, что и у
// "Подрядчики → Ресерч": 1 запрос — 1 карточка, внутри — сравнение
// предложений разных поставщиков, дешевле всех подсвечено (см. rankOffers
// в Suppliers.tsx, скопирован из ContractorsResearch.tsx один в один).
// В отличие от подрядчика (услуга) здесь сравнивают КОНКРЕТНЫЙ товар —
// поэтому у предложения дополнительно есть ссылка на сайт, карточка модели
// в каталоге (название+фото), статус переговоров (свободный текст,
// владелец вводит вручную) и место для файлов (счета, спецификации и т.п.).
//
// Владелец, 2026-08-29: "получим от строителя список материалов... ещё не
// знаем, у кого закупать, поэтому сначала ресерч, потом рассылка писем,
// после ответов — сравнение цен". items — то, что мы просим поставщиков
// оценить (не у каждого предложения свой список — один и тот же список
// материалов уходит всем в письме одного запроса). Переиспользован тип
// PurchaseItem из data/purchases.ts — тот же смысл (снимок материала на
// момент добавления, с опциональной ссылкой sourceMaterialId на
// EstimateMaterial), просто здесь price/note не обязательны к заполнению —
// на этапе ресерча цену как раз узнаём у поставщиков, а не фиксируем сами.
export interface SupplierRequest {
  id: string;
  title: string;
  estimateId: string | null;
  sectionId: string | null;
  sectionTitle: string;
  items: PurchaseItem[];
  createdAt: string;
}

export interface SupplierRequestRow {
  id: string;
  title: string;
  estimate_id: string | null;
  section_id: string | null;
  section_title: string | null;
  items: PurchaseItem[] | null;
  created_at: string;
}

export interface SupplierOffer {
  id: string;
  requestId: string;
  name: string;
  contact: string;
  contactMethod: ResearchContactMethod;
  // Отдельно от contact — тот же принцип, что у Contractor.email:
  // contact/contactMethod могут быть телефоном/телеграмом, а письмо всегда
  // уходит именно на email, если он указан (см. api/supplier-offer-send-email.js).
  email: string;
  websiteUrl: string;
  catalogModelName: string;
  catalogModelPhoto: DocumentFile | null;
  communicationStatus: string;
  price: number;
  currency: Currency;
  deadline: string;
  requirements: string;
  // Позиции КП (название/кол-во/ед./цена) — переиспользован PurchaseItem
  // (тот же смысл, что у SupplierRequest.items: снимок на момент добавления),
  // заполняются либо вручную, либо автораспознаванием счёта из переписки
  // (applyExtractionToOffer в SupplierCorrespondenceTab.tsx). requirements
  // остаётся отдельным свободным полем для условий/заметок, сюда позиции
  // больше не дублируются текстом (было так до 2026-09-03).
  items: PurchaseItem[];
  files: DocumentFile[];
  // Короткий технический код для plus-адреса переписки (см.
  // supplierOfferEmailAddress ниже) — 5 hex-символов, генерируется в БД
  // (default на колонке short_code, миграция 2026-09-03), уникален. Сам id —
  // полноценный UUID, слишком длинный для видимого email-адреса.
  shortCode: string;
  createdAt: string;
}

export interface SupplierOfferRow {
  id: string;
  request_id: string;
  name: string;
  contact: string;
  contact_method: string;
  email: string | null;
  website_url: string;
  catalog_model_name: string;
  catalog_model_photo: DocumentFile | null;
  communication_status: string;
  price: number;
  currency: string;
  deadline: string;
  requirements: string;
  items: PurchaseItem[] | null;
  files: DocumentFile[] | null;
  short_code: string;
  created_at: string;
}

// Email-адрес для переписки по конкретному предложению — тот же принцип
// plus-адресации, что и у purchaseEmailAddress (data/purchases.ts): ответ
// поставщика матчится на сервере по короткому коду в локальной части, без
// отдельного ящика на каждое предложение. Владелец, 2026-09-03: "давай
// заменим адрес на zakupki" — раньше был свой префикс research+ (нужен был,
// чтобы сервер по одному только адресу понимал, в какую таблицу класть
// письмо), теперь webhook сам определяет таблицу по тому, где реально
// нашёлся short_code (см. extractShortCode в api/purchase-email-webhook.js),
// поэтому оба вида переписки используют один и тот же префикс zakupki+.
// Старый research+-адрес всё ещё принимается на сервере (совместимость с
// уже отправленным вживую письмом), просто новые больше не строятся так.
export function supplierOfferEmailAddress(shortCode: string): string {
  return `zakupki+${shortCode}@redevelopment.pro`;
}

// Список материалов запроса одной строкой ("Керамогранит (50 м²), Клей
// (10 кг)") — общий хелпер для веб-поиска (openWebQueryModal в
// Suppliers.tsx) и для плейсхолдера {материалы} в шаблонах писем
// (lib/emailTemplates.ts), раньше формировался только на месте в первом
// случае, теперь один источник вместо двух копий.
export function formatRequestItemsText(items: PurchaseItem[], fallback: string): string {
  if (items.length === 0) return fallback;
  return items.map((i) => `${i.name}${i.quantity ? ` (${i.quantity}${i.unit ? ` ${i.unit}` : ''})` : ''}`).join(', ');
}
