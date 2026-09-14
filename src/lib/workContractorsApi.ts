import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { WorkContractor, WorkContractorRow } from '../data/workContractors';

function fromRow(row: WorkContractorRow): WorkContractor {
  return {
    id: row.id,
    avitoUrl: row.avito_url ?? '',
    email: row.email ?? '',
    shortCode: row.short_code,
    createdAt: row.created_at,
  };
}

export function fetchWorkContractors(): Promise<WorkContractor[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('work_contractors')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as WorkContractorRow[]).map(fromRow);
  });
}

// shortCode приложение не присылает — его генерирует сама база (default,
// см. миграцию), поэтому на вставке/обновлении его нет в payload, а обратно
// он приезжает в .select().
export function insertWorkContractor(
  input: Omit<WorkContractor, 'id' | 'createdAt' | 'shortCode'>,
): Promise<WorkContractor> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('work_contractors')
      .insert({ avito_url: input.avitoUrl, email: input.email })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as WorkContractorRow);
  });
}

export function updateWorkContractor(
  id: string,
  input: Omit<WorkContractor, 'id' | 'createdAt' | 'shortCode'>,
): Promise<WorkContractor> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('work_contractors')
      .update({ avito_url: input.avitoUrl, email: input.email })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as WorkContractorRow);
  });
}

// Письма удаляются каскадом (on delete cascade в миграции) — отдельной
// зачистки переписки здесь нет.
export function deleteWorkContractor(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('work_contractors').delete().eq('id', id);
    if (error) throw error;
  });
}
