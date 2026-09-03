import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { SupplierOrder, SupplierOrderRow } from '../data/supplierOrders';
import type { Currency } from '../data/transactions';

function fromRow(row: SupplierOrderRow): SupplierOrder {
  return {
    id: row.id,
    offerId: row.offer_id,
    title: row.title,
    communicationStatus: row.communication_status,
    price: row.price,
    currency: row.currency as Currency,
    deadline: row.deadline,
    requirements: row.requirements,
    items: row.items ?? [],
    files: row.files ?? [],
    shortCode: row.short_code,
    createdAt: row.created_at,
  };
}

// Все заявки сразу, группировка по offerId на клиенте — тот же принцип,
// что и у fetchSupplierOffers.
export function fetchSupplierOrders(): Promise<SupplierOrder[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('supplier_orders').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data as SupplierOrderRow[]).map(fromRow);
  });
}

export function insertSupplierOrder(input: Omit<SupplierOrder, 'id' | 'createdAt' | 'shortCode'>): Promise<SupplierOrder> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_orders')
      .insert({
        offer_id: input.offerId,
        title: input.title,
        communication_status: input.communicationStatus,
        price: input.price,
        currency: input.currency,
        deadline: input.deadline,
        requirements: input.requirements,
        items: input.items,
        files: input.files,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as SupplierOrderRow);
  });
}

export function updateSupplierOrder(id: string, input: Omit<SupplierOrder, 'id' | 'createdAt' | 'shortCode' | 'offerId'>): Promise<SupplierOrder> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_orders')
      .update({
        title: input.title,
        communication_status: input.communicationStatus,
        price: input.price,
        currency: input.currency,
        deadline: input.deadline,
        requirements: input.requirements,
        items: input.items,
        files: input.files,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as SupplierOrderRow);
  });
}

export function deleteSupplierOrder(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('supplier_orders').delete().eq('id', id);
    if (error) throw error;
  });
}
