import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { getCurrentProfile } from './accessProfile';
import {
  isPurchaseDeliveryStatus,
  type PurchaseDelivery,
  type PurchaseDeliveryRow,
} from '../data/purchaseDeliveries';

// Поставки по заказам (см. data/purchaseDeliveries.ts). Шаблон тот же, что у
// data/leads.ts + lib/leadsApi.ts.

function fromRow(row: PurchaseDeliveryRow): PurchaseDelivery {
  return {
    id: row.id,
    orderId: row.order_id,
    receiverId: row.receiver_id,
    receiverName: row.receiver_name ?? '',
    receiverPhone: row.receiver_phone ?? '',
    // Статус ограничен check-constraint'ом, но приходит строкой: незнакомое
    // значение показываем как «Запланирована», а не роняем страницу.
    status: isPurchaseDeliveryStatus(row.status) ? row.status : 'planned',
    plannedDate: row.planned_date,
    deliveredAt: row.delivered_at,
    poaNumber: row.poa_number ?? '',
    poaDate: row.poa_date,
    poaFile: row.poa_file ?? null,
    items: row.items ?? [],
    files: row.files ?? [],
    comment: row.comment ?? '',
    createdBy: row.created_by ?? '',
    createdAt: row.created_at,
  };
}

export type PurchaseDeliveryInput = Omit<PurchaseDelivery, 'id' | 'createdAt' | 'createdBy'>;

function toRow(input: PurchaseDeliveryInput) {
  return {
    order_id: input.orderId,
    receiver_id: input.receiverId,
    receiver_name: input.receiverName,
    receiver_phone: input.receiverPhone,
    status: input.status,
    // Пустая строка из <input type="date"> — это «не заполнено», а не дата:
    // в колонку date она уйдёт ошибкой «invalid input syntax».
    planned_date: input.plannedDate || null,
    delivered_at: input.deliveredAt || null,
    poa_number: input.poaNumber,
    poa_date: input.poaDate || null,
    poa_file: input.poaFile,
    items: input.items,
    files: input.files,
    comment: input.comment,
  };
}

export function fetchPurchaseDeliveriesByOrder(orderId: string): Promise<PurchaseDelivery[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_deliveries')
      .select('*')
      .eq('order_id', orderId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as PurchaseDeliveryRow[]).map(fromRow);
  });
}

// Поставки сразу по списку заказов — для значка «получено» в списке, чтобы
// не дёргать базу по разу на карточку. Пустой список заказов не превращаем
// в `in.()`: PostgREST на нём отвечает ошибкой, а не пустым массивом.
export function fetchPurchaseDeliveriesByOrders(orderIds: string[]): Promise<PurchaseDelivery[]> {
  if (orderIds.length === 0) return Promise.resolve([]);
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_deliveries')
      .select('*')
      .in('order_id', orderIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as PurchaseDeliveryRow[]).map(fromRow);
  });
}

export function insertPurchaseDelivery(input: PurchaseDeliveryInput): Promise<PurchaseDelivery> {
  return withRetry(async () => {
    const profile = getCurrentProfile();
    const { data, error } = await supabase
      .from('purchase_deliveries')
      .insert({ ...toRow(input), created_by: profile.displayName })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as PurchaseDeliveryRow);
  });
}

export function updatePurchaseDelivery(id: string, input: PurchaseDeliveryInput): Promise<PurchaseDelivery> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_deliveries')
      .update(toRow(input))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as PurchaseDeliveryRow);
  });
}

// Мягкое удаление — как у заказов: строка остаётся в базе, из интерфейса
// исчезает.
export function deletePurchaseDelivery(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('purchase_deliveries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  });
}
