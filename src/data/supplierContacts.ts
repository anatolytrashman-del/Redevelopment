import type { SupplierMessengerContact } from './supplierResearch';

// Контактное лицо компании-поставщика (шаг 3b плана
// docs/procurement-product-steps.md).
//
// Зачем отдельная сущность. В карточке закупки контакт один: contact +
// contactMethod + email + managerName. У живой компании людей несколько —
// письмо уходит на общий ящик, а отвечает менеджер со своего адреса. На
// момент переноса из 124 входящих писем оказалось 67 разных адресов, и 42 из
// них не было в карточках вообще: закупщик не видел, с кем он разговаривал.
//
// Список поддерживает себя сам: триггер в базе заводит контакт на новый
// адрес входящего письма и обновляет lastReplyAt у знакомого (см. миграцию
// 20260915-supplier-contacts.sql). Руками контакт правят и добавляют на
// странице компании.
export interface SupplierContact {
  id: string;
  supplierId: string;
  // Пустое имя — нормальное состояние: общий ящик компании (info@, zakaz@)
  // человеком не является, и выдумывать ему имя не надо.
  name: string;
  // Должность или отдел: «менеджер по продажам», «бухгалтерия», «склад».
  role: string;
  phone: string;
  email: string;
  messengers: SupplierMessengerContact[];
  // 'карточка' — перенесён из карточки закупки при миграции,
  // 'письмо' — человек сам нам написал, 'вручную' — завела закупщица.
  source: string;
  // Когда этот человек последний раз отвечал. null — не отвечал ни разу
  // (например, общий ящик, куда мы только пишем).
  lastReplyAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface SupplierContactRow {
  id: string;
  supplier_id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  messengers: SupplierMessengerContact[] | null;
  source: string;
  last_reply_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

export const CONTACT_SOURCE_LABEL: Record<string, string> = {
  'карточка': 'из карточки закупки',
  'письмо': 'написал нам сам',
  'вручную': 'добавлен вручную',
};
