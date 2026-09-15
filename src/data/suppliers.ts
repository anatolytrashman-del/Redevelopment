import type { SupplierMessengerContact } from './supplierResearch';

// Компания-поставщик как отдельная сущность (шаг 2 плана
// docs/procurement-product-steps.md, §5.2 аудита).
//
// Что здесь важно понимать про разницу с SupplierOffer. Строка
// supplier_research_offers — это НЕ компания, а её участие в одной
// категории закупки: у фирмы, которой писали и про краску, и про плитку,
// таких строк две, у каждой свои контакты, своя переписка и своя отметка о
// верификации. Supplier — это сама фирма, одна на все категории; карточки
// ссылаются на неё через supplier_research_offers.supplier_id.
//
// Компанию заводит не приложение, а база: триггер supplier_offer_attach_company
// на вставке карточки ищет фирму по домену сайта, затем по ИНН, затем по
// нормализованному названию при совпадающей стране (тот же порядок, что в
// isSameSupplier), и создаёт новую, только если ничего не нашлось. Поэтому
// insertSupplier в suppliersApi.ts нужен для ручного заведения компании, а
// не как обязательный шаг перед добавлением карточки.
export interface Supplier {
  id: string;
  name: string;
  // Домен сайта без протокола, www и пути — основной ключ отождествления
  // (см. supplierWebsiteHost в supplierResearch.ts, в базе то же самое
  // делает функция supplier_website_host). Пустая строка — компания без
  // сайта, такие отождествляются по названию и стране.
  websiteHost: string;
  websiteUrl: string;
  // ИНН появляется только после первого счёта — null здесь нормальное
  // состояние, а не пробел в данных (тот же смысл, что у SupplierOffer.inn).
  inn: string | null;
  country: string;
  city: string;
  email: string;
  // Отдельное поле, в отличие от карточки: там телефон живёт в contact при
  // contactMethod = 'Телефон', и вытащить его иначе нельзя.
  phone: string;
  messengers: SupplierMessengerContact[];
  termsNote: string;
  // «Данные компании смотрел человек» — сводится из карточек: достаточно
  // одной верифицированной, чтобы компания считалась проверенной (то же
  // правило, что при слиянии дублей в buildMergedOfferPayload).
  verified: boolean;
  createdAt: string;
  // Мягкое удаление — см. шаг 1 плана и миграцию
  // 20260915-soft-delete-supplier-data.sql. null — компания активна.
  deletedAt: string | null;
  // Стоп-лист (шаг 4b): причина, по которой компании больше не пишем.
  // null — в работе. Отличается от deletedAt тем, что компания остаётся
  // видна со всей историей: «не работаем и вот почему» — это знание, которое
  // нужно хранить, а не прятать.
  blockedReason: string | null;
  blockedAt: string | null;
}

export interface SupplierRow {
  id: string;
  name: string;
  website_host: string | null;
  website_url: string;
  inn: string | null;
  country: string;
  city: string;
  email: string;
  phone: string;
  messengers: SupplierMessengerContact[] | null;
  terms_note: string;
  verified: boolean;
  created_at: string;
  deleted_at: string | null;
  blocked_reason: string | null;
  blocked_at: string | null;
}
