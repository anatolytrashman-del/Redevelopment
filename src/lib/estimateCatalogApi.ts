import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { EstimateCatalogItem, EstimateCatalogItemRow } from '../data/estimateCatalog';

function fromRow(row: EstimateCatalogItemRow): EstimateCatalogItem {
  return {
    id: row.id,
    title: row.title,
    ops: row.ops ?? [],
    materials: row.materials ?? '',
    createdAt: row.created_at,
  };
}

export function fetchEstimateCatalogItems(): Promise<EstimateCatalogItem[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('estimate_catalog_items').select('*').order('title', { ascending: true });
    if (error) throw error;
    return (data as EstimateCatalogItemRow[]).map(fromRow);
  });
}

export function insertEstimateCatalogItem(input: Omit<EstimateCatalogItem, 'id' | 'createdAt'>): Promise<EstimateCatalogItem> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('estimate_catalog_items')
      .insert({ title: input.title, ops: input.ops, materials: input.materials })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as EstimateCatalogItemRow);
  });
}

export function deleteEstimateCatalogItem(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('estimate_catalog_items').delete().eq('id', id);
    if (error) throw error;
  });
}
