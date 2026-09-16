import type { Currency } from './transactions';
import type { DocumentFile } from './contractorDocuments';
import { purchaseItemTotal, type PurchaseItem, type PurchaseItemMatchKind } from './purchases';

// Заказ поставщику (шаг 11 плана docs/procurement-product-steps.md, §4.1
// аудита) — то, чем заканчивается утверждённый лист «Сравнения цен». Одна
// строка = что заказали у ОДНОЙ компании по одной категории закупки.
//
// Почему это не Purchase (src/data/purchases.ts). Purchase — сущность первого
// прототипа: заводится руками, поставщик там — подрядчик из «Команды», с
// отбором цен не связана вовсе. Заказ рождается из отбора: позиции, цены и
// поставщик берутся из того, что уже утвердил руководитель, а не набиваются
// заново.

// Статусы жизни заказа. Порядок в массиве — порядок нормального хода, им же
// рисуется полоса прогресса в карточке; 'cancelled'/'claim' — выходы вбок.
export const PURCHASE_ORDER_FLOW = [
  'draft',
  'ordered',
  'invoiced',
  'paid',
  'shipped',
  'delivered',
  'accepted',
  'closed',
] as const;

export const PURCHASE_ORDER_STATUSES = [...PURCHASE_ORDER_FLOW, 'cancelled', 'claim'] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Черновик',
  ordered: 'Заказано',
  invoiced: 'Счёт выставлен',
  paid: 'Оплачено',
  shipped: 'Отгружено',
  delivered: 'Доставлено',
  accepted: 'Принято',
  closed: 'Закрыто',
  cancelled: 'Отменён',
  claim: 'Претензия',
};

export interface PurchaseOrder {
  id: string;
  // Человекочитаемый номер вида «З-2026-0007», генерируется в базе.
  number: string;
  requestId: string | null;
  offerId: string | null;
  supplierId: string | null;
  legalEntityId: string | null;
  // Снимок имени поставщика на момент заказа: карточку могут переименовать
  // или удалить, заказ должен оставаться читаемым.
  supplierName: string;
  status: PurchaseOrderStatus;
  // Снимок позиций (PurchaseItem): quantity/unit — из ведомости, price — цена
  // за единицу ВЕДОМОСТИ с НДС, та самая, по которой сравнивали.
  items: PurchaseItem[];
  delivery: number | null;
  total: number;
  currency: Currency;
  deliveryAddress: string;
  deliveryDue: string | null;
  // Счёт поставщика и платёжка по нему — файлами и реквизитами (владелец,
  // 2026-09-16: «Платежка (оплаченный счет поставщика)»). Плановый платёж в
  // «Транзакциях» сознательно НЕ заводится — решение владельца того же дня;
  // сверка позиций счёта с позициями заказа — шаг 12.
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceFile: DocumentFile | null;
  paymentNumber: string;
  paymentDate: string | null;
  // Сумма платежа отдельно от total: платят и частями (предоплата 50 %), и
  // с округлением, и не всегда ровно то, что в заказе.
  paymentAmount: number | null;
  paymentFile: DocumentFile | null;
  // Ответственный за приёмку и доверенность на получение ТМЦ — на самом
  // заказе (владелец, 2026-09-16: «Ответственного за приемку выводи на эту же
  // страницу», «Сюда же форму загрузки доверенности»). Заказ оплачен и ждёт
  // машину задолго до первой поставки, и кто принимает — известно уже тогда.
  // Поставка берёт их по умолчанию и может переопределить: другая машина —
  // другой человек и своя доверенность.
  receiverId: string | null;
  poaNumber: string;
  poaDate: string | null;
  poaFile: DocumentFile | null;
  comment: string;
  createdBy: string;
  createdAt: string;
}

export interface PurchaseOrderRow {
  id: string;
  number: string;
  request_id: string | null;
  offer_id: string | null;
  supplier_id: string | null;
  legal_entity_id: string | null;
  supplier_name: string;
  status: string;
  items: PurchaseItem[] | null;
  delivery: number | string | null;
  total: number | string | null;
  currency: string;
  delivery_address: string | null;
  delivery_due: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_file: DocumentFile | null;
  payment_number: string | null;
  payment_date: string | null;
  payment_amount: number | string | null;
  payment_file: DocumentFile | null;
  receiver_id: string | null;
  poa_number: string | null;
  poa_date: string | null;
  poa_file: DocumentFile | null;
  comment: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at?: string | null;
}

// Журнал заказа. Смены статуса пишет триггер в базе (см. миграцию
// 20260916-purchase-orders.sql) — история не зависит от того, откуда пришла
// правка: интерфейс, Edge Function или ручной SQL.
export interface PurchaseOrderEvent {
  id: string;
  orderId: string;
  kind: string;
  fromStatus: PurchaseOrderStatus | null;
  toStatus: PurchaseOrderStatus | null;
  note: string;
  actor: string;
  createdAt: string;
}

export interface PurchaseOrderEventRow {
  id: string;
  order_id: string;
  kind: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor: string | null;
  created_at: string;
}

export function isPurchaseOrderStatus(value: string): value is PurchaseOrderStatus {
  return (PURCHASE_ORDER_STATUSES as readonly string[]).includes(value);
}

export function purchaseOrderItemsTotal(items: PurchaseItem[]): number {
  return items.reduce((sum, item) => sum + purchaseItemTotal(item), 0);
}

export function purchaseOrderTotal(order: Pick<PurchaseOrder, 'items' | 'delivery'>): number {
  return purchaseOrderItemsTotal(order.items) + (order.delivery ?? 0);
}

// ===========================================================================
// Сборка заказов из утверждённого отбора
// ===========================================================================
// Типы входа описаны здесь структурно, а не импортом из
// components/suppliers/priceComparisonModel: строка отбора (Cell) и позиция
// ведомости (EstimateMaterial) подходят под них как есть, а слой данных не
// должен зависеть от компонента сравнения.

export interface OrderDraftPosition {
  id: string;
  name: string;
  unit: string;
  quantity: number | null;
}

export interface OrderDraftCell {
  offerId: string;
  itemId: string;
  unitPrice: number;
  currency: Currency;
  kind: PurchaseItemMatchKind;
  note: string;
  productUrl: string;
}

export interface OrderDraftPick {
  position: OrderDraftPosition;
  cell: OrderDraftCell | null;
}

export interface OrderDraftSupplier {
  offerId: string;
  name: string;
  supplierId: string | null;
  // Валюта карточки поставщика и сумма строк-доставок из последнего счёта.
  currency: Currency;
  delivery: number | null;
}

export interface PurchaseOrderDraft {
  offerId: string;
  supplierId: string | null;
  supplierName: string;
  currency: Currency;
  items: PurchaseItem[];
  delivery: number | null;
  total: number;
}

// Группировка отобранных ячеек по поставщику: по заказу на каждого.
//
// Группируем по паре «поставщик + валюта», а не по одному поставщику: у
// одного и того же поставщика часть позиций может быть в долларах (так уже
// бывает у алюминия и оцинковки), а заказ с двумя валютами в одной сумме —
// это заказ, сумму которого нельзя назвать. Доставка ложится в тот заказ,
// валюта которого совпадает с валютой карточки: доставку считает поставщик в
// своей валюте, дробить её между заказами нечем.
export function buildPurchaseOrderDrafts(
  picks: OrderDraftPick[],
  suppliers: OrderDraftSupplier[],
): PurchaseOrderDraft[] {
  const supplierById = new Map(suppliers.map((s) => [s.offerId, s]));
  const drafts = new Map<string, PurchaseOrderDraft>();

  for (const { position, cell } of picks) {
    if (!cell) continue;
    // Строка доставки — не позиция ведомости; она приезжает отдельным полем.
    if (cell.kind === 'delivery') continue;
    const supplier = supplierById.get(cell.offerId);
    if (!supplier) continue;

    const key = `${cell.offerId}|${cell.currency}`;
    let draft = drafts.get(key);
    if (!draft) {
      draft = {
        offerId: supplier.offerId,
        supplierId: supplier.supplierId,
        supplierName: supplier.name,
        currency: cell.currency,
        items: [],
        delivery: null,
        total: 0,
      };
      drafts.set(key, draft);
    }

    draft.items.push({
      id: position.id,
      sourceMaterialId: position.id,
      name: position.name,
      unit: position.unit,
      quantity: position.quantity,
      price: cell.unitPrice,
      unitPrice: cell.unitPrice,
      note: cell.note ?? '',
      ...(cell.kind ? { matchKind: cell.kind } : {}),
      ...(cell.productUrl ? { productUrl: cell.productUrl } : {}),
    });
  }

  for (const draft of drafts.values()) {
    const supplier = supplierById.get(draft.offerId);
    if (supplier && supplier.delivery != null && supplier.currency === draft.currency) {
      draft.delivery = supplier.delivery;
    }
    draft.total = purchaseOrderTotal(draft);
  }

  return [...drafts.values()];
}
