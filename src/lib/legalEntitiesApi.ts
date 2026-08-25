import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { LegalEntity, LegalEntityRow } from '../data/legalEntities';

function fromRow(row: LegalEntityRow): LegalEntity {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export function fetchLegalEntities(): Promise<LegalEntity[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('legal_entities').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data as LegalEntityRow[]).map(fromRow);
  });
}

export function insertLegalEntity(name: string): Promise<LegalEntity> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('legal_entities').insert({ name }).select().single();
    if (error) throw error;
    return fromRow(data as LegalEntityRow);
  });
}

// Каскад на legal_entity_id (см. миграцию) сам чистит декларации этого юрлица.
export function deleteLegalEntity(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('legal_entities').delete().eq('id', id);
    if (error) throw error;
  });
}
