import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { getCurrentProfile } from './accessProfile';
import {
  isPurchaseOrderStatus,
  purchaseOrderTotal,
  type PurchaseOrder,
  type PurchaseOrderDraft,
  type PurchaseOrderEvent,
  type PurchaseOrderEventRow,
  type PurchaseOrderRow,
  type PurchaseOrderStatus,
} from '../data/purchaseOrders';
import type { Currency } from '../data/transactions';

// Заказы поставщикам (шаг 11 плана закупок). Шаблон тот же, что у
// data/leads.ts + lib/leadsApi.ts.

function num(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function fromRow(row: PurchaseOrderRow): PurchaseOrder {
  return {
    id: row.id,
    number: row.number,
    requestId: row.request_id,
    offerId: row.offer_id,
    supplierId: row.supplier_id,
    legalEntityId: row.legal_entity_id,
    supplierName: row.supplier_name ?? '',
    // Статус из базы ограничен check-constraint'ом, но данные всё равно
    // приходят строкой — незнакомое значение показываем как черновик, а не
    // роняем страницу.
    status: isPurchaseOrderStatus(row.status) ? row.status : 'draft',
    items: row.items ?? [],
    delivery: num(row.delivery),
    total: num(row.total) ?? 0,
    currency: (row.currency || 'RUB') as Currency,
    deliveryAddress: row.delivery_address ?? '',
    deliveryDue: row.delivery_due,
    invoiceNumber: row.invoice_number ?? '',
    invoiceDate: row.invoice_date,
    invoiceFile: row.invoice_file ?? null,
    paymentNumber: row.payment_number ?? '',
    paymentDate: row.payment_date,
    paymentAmount: num(row.payment_amount),
    paymentFile: row.payment_file ?? null,
    comment: row.comment ?? '',
    createdBy: row.created_by ?? '',
    createdAt: row.created_at,
  };
}

function eventFromRow(row: PurchaseOrderEventRow): PurchaseOrderEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    kind: row.kind,
    fromStatus: row.from_status && isPurchaseOrderStatus(row.from_status) ? row.from_status : null,
    toStatus: row.to_status && isPurchaseOrderStatus(row.to_status) ? row.to_status : null,
    note: row.note ?? '',
    actor: row.actor ?? '',
    createdAt: row.created_at,
  };
}

// Заказов на всю компанию за год будут сотни, не тысячи, но правило
// «PostgREST отдаёт максимум 1000 строк» (CLAUDE.md) действует и здесь:
// общий список страницами, выборки по категории/поставщику — без пагинации,
// там больше десятка не набирается.
const PAGE = 1000;

export function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  return withRetry(async () => {
    const all: PurchaseOrderRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as PurchaseOrderRow[];
      all.push(...rows);
      if (rows.length < PAGE) break;
    }
    return all.map(fromRow);
  });
}

export function fetchPurchaseOrdersByRequest(requestId: string): Promise<PurchaseOrder[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('request_id', requestId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as PurchaseOrderRow[]).map(fromRow);
  });
}

// Заказы одной компании — для раздела «Заказы и поставки» на странице
// поставщика. Отдельная выборка, а не фильтр общего списка: заказов у одной
// компании единицы, тянуть ради них все заказы организации незачем.
// У карточек, заведённых до шага 2 плана, supplier_id пуст — их заказы
// видны только на «Закупках», и это ожидаемо.
export function fetchPurchaseOrdersBySupplier(supplierId: string): Promise<PurchaseOrder[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('supplier_id', supplierId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as PurchaseOrderRow[]).map(fromRow);
  });
}

export function fetchPurchaseOrderEvents(orderId: string): Promise<PurchaseOrderEvent[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as PurchaseOrderEventRow[]).map(eventFromRow);
  });
}

// Создание заказов из утверждённого листа сравнения: по заказу на поставщика
// (drafts считает buildPurchaseOrderDrafts). Одной вставкой — чтобы половина
// заказов не осталась висеть, если сеть оборвётся на середине списка.
// Статус проставляется 'draft': поставщику ещё ничего не отправляли, письмо
// заказа — шаг 12 плана.
export function insertPurchaseOrders(
  drafts: PurchaseOrderDraft[],
  context: { requestId: string; legalEntityId: string | null },
): Promise<PurchaseOrder[]> {
  return withRetry(async () => {
    const profile = getCurrentProfile();
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert(
        drafts.map((draft) => ({
          request_id: context.requestId,
          offer_id: draft.offerId,
          supplier_id: draft.supplierId,
          legal_entity_id: context.legalEntityId,
          supplier_name: draft.supplierName,
          status: 'draft',
          items: draft.items,
          delivery: draft.delivery,
          total: purchaseOrderTotal(draft),
          currency: draft.currency,
          created_by: profile.displayName,
          updated_by: profile.displayName,
        })),
      )
      .select();
    if (error) throw error;
    return ((data ?? []) as PurchaseOrderRow[]).map(fromRow);
  });
}

// Смена статуса. updated_by пишется вместе со статусом не для красоты:
// именно его триггер в базе переносит в журнал заказа, отдельной записи
// события фронт не делает.
export function updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrder> {
  return withRetry(async () => {
    const profile = getCurrentProfile();
    const { data, error } = await supabase
      .from('purchase_orders')
      .update({ status, updated_by: profile.displayName })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as PurchaseOrderRow);
  });
}

// Пустая строка из <input type="date"> — это «не заполнено»: в колонку date
// она уходит ошибкой «invalid input syntax for type date».
function dateOrNull(value: string | null | undefined): string | null {
  return value ? value : null;
}

export function updatePurchaseOrder(
  id: string,
  patch: Partial<
    Pick<
      PurchaseOrder,
      | 'deliveryAddress'
      | 'deliveryDue'
      | 'comment'
      | 'legalEntityId'
      | 'invoiceNumber'
      | 'invoiceDate'
      | 'invoiceFile'
      | 'paymentNumber'
      | 'paymentDate'
      | 'paymentAmount'
      | 'paymentFile'
    >
  >,
): Promise<PurchaseOrder> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .update({
        ...(patch.deliveryAddress !== undefined ? { delivery_address: patch.deliveryAddress } : {}),
        ...(patch.deliveryDue !== undefined ? { delivery_due: dateOrNull(patch.deliveryDue) } : {}),
        ...(patch.comment !== undefined ? { comment: patch.comment } : {}),
        ...(patch.legalEntityId !== undefined ? { legal_entity_id: patch.legalEntityId } : {}),
        ...(patch.invoiceNumber !== undefined ? { invoice_number: patch.invoiceNumber } : {}),
        ...(patch.invoiceDate !== undefined ? { invoice_date: dateOrNull(patch.invoiceDate) } : {}),
        ...(patch.invoiceFile !== undefined ? { invoice_file: patch.invoiceFile } : {}),
        ...(patch.paymentNumber !== undefined ? { payment_number: patch.paymentNumber } : {}),
        ...(patch.paymentDate !== undefined ? { payment_date: dateOrNull(patch.paymentDate) } : {}),
        ...(patch.paymentAmount !== undefined ? { payment_amount: patch.paymentAmount } : {}),
        ...(patch.paymentFile !== undefined ? { payment_file: patch.paymentFile } : {}),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as PurchaseOrderRow);
  });
}

// Мягкое удаление — как у остальных данных закупок: строка живёт, из
// интерфейса пропадает (заказ мог быть оплачен, и стирать его нельзя).
export function deletePurchaseOrder(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('purchase_orders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  });
}
