import type { Currency } from './transactions';
import type { DocumentFile } from './contractorDocuments';
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
export interface SupplierRequest {
  id: string;
  title: string;
  createdAt: string;
}

export interface SupplierRequestRow {
  id: string;
  title: string;
  created_at: string;
}

export interface SupplierOffer {
  id: string;
  requestId: string;
  name: string;
  contact: string;
  contactMethod: ResearchContactMethod;
  websiteUrl: string;
  catalogModelName: string;
  catalogModelPhoto: DocumentFile | null;
  communicationStatus: string;
  price: number;
  currency: Currency;
  deadline: string;
  requirements: string;
  files: DocumentFile[];
  createdAt: string;
}

export interface SupplierOfferRow {
  id: string;
  request_id: string;
  name: string;
  contact: string;
  contact_method: string;
  website_url: string;
  catalog_model_name: string;
  catalog_model_photo: DocumentFile | null;
  communication_status: string;
  price: number;
  currency: string;
  deadline: string;
  requirements: string;
  files: DocumentFile[] | null;
  created_at: string;
}
