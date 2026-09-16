import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { getCurrentProfile } from './accessProfile';
import {
  isPurchaseDocumentKind,
  type PurchaseDocument,
  type PurchaseDocumentRow,
} from '../data/purchaseDocuments';

// Документы заказа (см. data/purchaseDocuments.ts). Шаблон тот же, что у
// data/leads.ts + lib/leadsApi.ts.

function fromRow(row: PurchaseDocumentRow): PurchaseDocument {
  return {
    id: row.id,
    orderId: row.order_id,
    deliveryId: row.delivery_id,
    kind: isPurchaseDocumentKind(row.kind) ? row.kind : 'other',
    title: row.title ?? '',
    file: row.file,
    uploadedBy: row.uploaded_by ?? '',
    createdAt: row.created_at,
  };
}

export function fetchPurchaseDocumentsByOrder(orderId: string): Promise<PurchaseDocument[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_documents')
      .select('*')
      .eq('order_id', orderId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as PurchaseDocumentRow[]).map(fromRow);
  });
}

export function insertPurchaseDocument(
  input: Omit<PurchaseDocument, 'id' | 'createdAt' | 'uploadedBy'>,
): Promise<PurchaseDocument> {
  return withRetry(async () => {
    const profile = getCurrentProfile();
    const { data, error } = await supabase
      .from('purchase_documents')
      .insert({
        order_id: input.orderId,
        delivery_id: input.deliveryId,
        kind: input.kind,
        title: input.title,
        file: input.file,
        uploaded_by: profile.displayName,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as PurchaseDocumentRow);
  });
}

export function updatePurchaseDocument(
  id: string,
  patch: Partial<Pick<PurchaseDocument, 'kind' | 'title' | 'deliveryId'>>,
): Promise<PurchaseDocument> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchase_documents')
      .update({
        ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.deliveryId !== undefined ? { delivery_id: patch.deliveryId } : {}),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as PurchaseDocumentRow);
  });
}

// Мягкое удаление: файл остаётся в хранилище и в базе, из списка исчезает.
// История загрузок не должна переписываться задним числом.
export function deletePurchaseDocument(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('purchase_documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  });
}
