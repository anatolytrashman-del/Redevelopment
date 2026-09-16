import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { PurchaseReceiver, PurchaseReceiverRow } from '../data/purchaseReceivers';

// Принимающие лица — шаблоны для поставок (см. data/purchaseReceivers.ts).
// Список короткий (люди компании, не сотни строк), поэтому без пагинации:
// правило «PostgREST отдаёт максимум 1000 строк» здесь недостижимо.

function fromRow(row: PurchaseReceiverRow): PurchaseReceiver {
  return {
    id: row.id,
    legalEntityId: row.legal_entity_id,
    name: row.name ?? '',
    phone: row.phone ?? '',
    position: row.position ?? '',
    passport: row.passport ?? '',
    note: row.note ?? '',
    createdAt: row.created_at,
  };
}

type ReceiverInput = Omit<PurchaseReceiver, 'id' | 'createdAt'>;

function toRow(input: ReceiverInput) {
  return {
    legal_entity_id: input.legalEntityId,
    name: input.name,
    phone: input.phone,
    position: input.position,
    passport: input.passport,
    note: input.note,
  };
}

export function fetchPurchaseReceivers(): Promise<PurchaseReceiver[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_receivers')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as PurchaseReceiverRow[]).map(fromRow);
  });
}

export function insertPurchaseReceiver(input: ReceiverInput): Promise<PurchaseReceiver> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('purchase_receivers').insert(toRow(input)).select().single();
    if (error) throw error;
    return fromRow(data as PurchaseReceiverRow);
  });
}

export function updatePurchaseReceiver(id: string, input: ReceiverInput): Promise<PurchaseReceiver> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_receivers')
      .update(toRow(input))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as PurchaseReceiverRow);
  });
}

// Мягкое удаление: поставки, которые человек принял, ссылаются на него и
// должны остаться читаемыми (в самой поставке лежит ещё и снимок имени).
export function deletePurchaseReceiver(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('purchase_receivers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  });
}
