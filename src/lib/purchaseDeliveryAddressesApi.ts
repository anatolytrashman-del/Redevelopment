import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type {
  PurchaseDeliveryAddress,
  PurchaseDeliveryAddressRow,
} from '../data/purchaseDeliveryAddresses';

// Шаблоны адресов доставки (см. data/purchaseDeliveryAddresses.ts). Список
// короткий — объекты компании, — поэтому без пагинации.

function fromRow(row: PurchaseDeliveryAddressRow): PurchaseDeliveryAddress {
  return {
    id: row.id,
    legalEntityId: row.legal_entity_id,
    address: row.address,
    note: row.note ?? '',
    createdAt: row.created_at,
  };
}

export function fetchPurchaseDeliveryAddresses(): Promise<PurchaseDeliveryAddress[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_delivery_addresses')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as PurchaseDeliveryAddressRow[]).map(fromRow);
  });
}

export function insertPurchaseDeliveryAddress(
  input: Omit<PurchaseDeliveryAddress, 'id' | 'createdAt'>,
): Promise<PurchaseDeliveryAddress> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_delivery_addresses')
      .insert({ legal_entity_id: input.legalEntityId, address: input.address, note: input.note })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as PurchaseDeliveryAddressRow);
  });
}

export function deletePurchaseDeliveryAddress(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('purchase_delivery_addresses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  });
}
