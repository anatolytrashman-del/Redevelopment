import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { purchaseStatuses, type Purchase, type PurchaseItem, type PurchaseRow } from '../data/purchases';
import type { Currency } from '../data/transactions';

function fromRow(row: PurchaseRow): Purchase {
  return {
    id: row.id,
    title: row.title,
    status: row.status || purchaseStatuses[0],
    contractorId: row.contractor_id,
    estimateId: row.estimate_id,
    sectionId: row.section_id,
    sectionTitle: row.section_title ?? '',
    items: row.items ?? [],
    currency: (row.currency as Currency) || 'BYN',
    shortCode: row.short_code,
    createdAt: row.created_at,
  };
}

export function fetchPurchases(): Promise<Purchase[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('purchases').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as PurchaseRow[]).map(fromRow);
  });
}

export function fetchPurchase(id: string): Promise<Purchase> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('purchases').select('*').eq('id', id).single();
    if (error) throw error;
    return fromRow(data as PurchaseRow);
  });
}

export interface PurchaseInput {
  title: string;
  status: string;
  contractorId: string | null;
  estimateId: string | null;
  sectionId: string | null;
  sectionTitle: string;
  items: PurchaseItem[];
  currency: Currency;
}

export function insertPurchase(input: PurchaseInput): Promise<Purchase> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchases')
      .insert({
        title: input.title,
        status: input.status,
        contractor_id: input.contractorId,
        estimate_id: input.estimateId,
        section_id: input.sectionId,
        section_title: input.sectionTitle,
        items: input.items,
        currency: input.currency,
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as PurchaseRow);
  });
}

export function updatePurchase(id: string, input: PurchaseInput): Promise<Purchase> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('purchases')
      .update({
        title: input.title,
        status: input.status,
        contractor_id: input.contractorId,
        estimate_id: input.estimateId,
        section_id: input.sectionId,
        section_title: input.sectionTitle,
        items: input.items,
        currency: input.currency,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as PurchaseRow);
  });
}

export function deletePurchase(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('purchases').delete().eq('id', id);
    if (error) throw error;
  });
}
