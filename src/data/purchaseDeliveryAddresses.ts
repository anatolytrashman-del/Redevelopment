// Адреса доставки шаблонами (владелец, 2026-09-16: «Вытащи адрес доставки из
// шаблона при отправке поставщику, там он указан и сохрани как шаблон»).
//
// Адрес объекта уже лежит в `legal_entities.delivery_info` — том самом
// тексте, который уходит поставщику вложением «Информация по доставке», — но
// как ТЕКСТ, вперемешку с условиями разгрузки. В заказ нужна одна строка
// адреса, поэтому: из delivery_info её достаёт deliveryAddressFromInfo
// (см. data/legalEntities.ts), а дальше адреса живут здесь списком — объектов
// и точек выгрузки со временем становится больше одной.

export interface PurchaseDeliveryAddress {
  id: string;
  legalEntityId: string | null;
  address: string;
  note: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/purchaseDeliveryAddressesApi.ts
export interface PurchaseDeliveryAddressRow {
  id: string;
  legal_entity_id: string | null;
  address: string;
  note: string | null;
  created_at: string;
  deleted_at?: string | null;
}
