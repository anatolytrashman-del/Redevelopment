import type { DocumentFile } from './contractorDocuments';
import type { PurchaseItem } from './purchases';

// Поставка по заказу (владелец, 2026-09-16: «Частичную поставку заложи, да»).
//
// Почему отдельная сущность, а не поля на заказе. Из одного заказа товар
// едет не обязательно разом: часть со склада сегодня, часть транзитом через
// неделю. У каждой машины своя дата, свой приёмщик и своя доверенность —
// в полях заказа это не помещается, а «дата поставки» на заказе честно
// отвечала бы только на случай «приехало всё и сразу».
//
// Поставка ссылается на позиции заказа по id (DeliveryLine.itemId =
// PurchaseItem.id из purchase_orders.items) и хранит, СКОЛЬКО по каждой
// приехало. Остаток считается вычитанием, отдельной колонки «осталось» нет:
// два источника правды про одно и то же число всегда расходятся.

export const PURCHASE_DELIVERY_STATUSES = [
  'planned',
  'shipped',
  'delivered',
  'accepted',
  'claim',
  'cancelled',
] as const;

export type PurchaseDeliveryStatus = (typeof PURCHASE_DELIVERY_STATUSES)[number];

export const PURCHASE_DELIVERY_STATUS_LABELS: Record<PurchaseDeliveryStatus, string> = {
  planned: 'Запланирована',
  shipped: 'В пути',
  delivered: 'Привезли',
  accepted: 'Принята',
  claim: 'Претензия',
  cancelled: 'Отменена',
};

// Статусы, при которых товар физически у нас и его количество надо
// засчитать в «получено». 'claim' сюда входит осознанно: претензия — это
// «привезли, но с браком/недовозом», и сколько именно приехало, человек
// пишет в количестве; не засчитывать её значило бы показывать ноль там, где
// половина заказа уже на объекте.
const RECEIVED_STATUSES: PurchaseDeliveryStatus[] = ['delivered', 'accepted', 'claim'];

export interface DeliveryLine {
  // id позиции заказа (PurchaseItem.id внутри purchase_orders.items).
  itemId: string;
  // Сколько приехало. null — строка есть, количество не указали.
  quantity: number | null;
}

export interface PurchaseDelivery {
  id: string;
  orderId: string;
  receiverId: string | null;
  // Снимок приёмщика на момент поставки — см. комментарий в purchaseReceivers.ts.
  receiverName: string;
  receiverPhone: string;
  status: PurchaseDeliveryStatus;
  plannedDate: string | null;
  deliveredAt: string | null;
  poaNumber: string;
  poaDate: string | null;
  // Доверенность готовым файлом: владелец грузит свой документ, из шаблона
  // она не генерируется (решение 2026-09-16).
  poaFile: DocumentFile | null;
  items: DeliveryLine[];
  // Документы поставки: накладная, УПД, акт.
  files: DocumentFile[];
  comment: string;
  createdBy: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/purchaseDeliveriesApi.ts
export interface PurchaseDeliveryRow {
  id: string;
  order_id: string;
  receiver_id: string | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  status: string;
  planned_date: string | null;
  delivered_at: string | null;
  poa_number: string | null;
  poa_date: string | null;
  poa_file: DocumentFile | null;
  items: DeliveryLine[] | null;
  files: DocumentFile[] | null;
  comment: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at?: string | null;
}

export function isPurchaseDeliveryStatus(value: string): value is PurchaseDeliveryStatus {
  return (PURCHASE_DELIVERY_STATUSES as readonly string[]).includes(value);
}

// Сколько всего получено по каждой позиции заказа. Ключ — PurchaseItem.id.
export function receivedByItem(deliveries: PurchaseDelivery[]): Map<string, number> {
  const received = new Map<string, number>();
  for (const delivery of deliveries) {
    if (!RECEIVED_STATUSES.includes(delivery.status)) continue;
    for (const line of delivery.items) {
      if (line.quantity == null || !Number.isFinite(line.quantity)) continue;
      received.set(line.itemId, (received.get(line.itemId) ?? 0) + line.quantity);
    }
  }
  return received;
}

export interface DeliveryProgress {
  // Позиций в заказе, по которым вообще задано количество.
  total: number;
  // Из них закрыты полностью.
  done: number;
  // Начата, но не закрыта хотя бы одна позиция.
  partial: boolean;
  // Приехало больше, чем заказывали, — повод посмотреть глазами, а не
  // молча округлить: обычно это опечатка в количестве либо поставщик привёз
  // с запасом и это надо оплачивать.
  over: boolean;
}

// Сводка «закрыт ли заказ поставками». Позиции без количества в заказе
// (quantity = null — так бывает у строки «доставка») в знаменатель не идут:
// закрыть их нечем, и они бы вечно держали заказ незакрытым.
export function deliveryProgress(items: PurchaseItem[], deliveries: PurchaseDelivery[]): DeliveryProgress {
  const received = receivedByItem(deliveries);
  let total = 0;
  let done = 0;
  let started = 0;
  let over = false;
  for (const item of items) {
    if (item.quantity == null || !Number.isFinite(item.quantity) || item.quantity <= 0) continue;
    total += 1;
    const got = received.get(item.id) ?? 0;
    if (got > 0) started += 1;
    // Допуск в сотую долю единицы: количества приходят из счетов дробными
    // (993.6 м²), и точное равенство на них не срабатывает.
    if (got + 0.01 >= item.quantity) done += 1;
    if (got > item.quantity + 0.01) over = true;
  }
  return { total, done, partial: started > 0 && done < total, over };
}
