import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { WorkContractorTemplate, WorkContractorTemplateRow } from '../data/workContractorTemplates';

function fromRow(row: WorkContractorTemplateRow): WorkContractorTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject ?? '',
    body: row.body ?? '',
    createdAt: row.created_at,
  };
}

function toRow(input: Omit<WorkContractorTemplate, 'id' | 'createdAt'>) {
  return { name: input.name, subject: input.subject, body: input.body };
}

export function fetchWorkContractorTemplates(): Promise<WorkContractorTemplate[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('work_contractor_email_templates')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data as WorkContractorTemplateRow[]).map(fromRow);
  });
}

export function insertWorkContractorTemplate(
  input: Omit<WorkContractorTemplate, 'id' | 'createdAt'>,
): Promise<WorkContractorTemplate> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('work_contractor_email_templates')
      .insert(toRow(input))
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as WorkContractorTemplateRow);
  });
}

export function updateWorkContractorTemplate(
  id: string,
  input: Omit<WorkContractorTemplate, 'id' | 'createdAt'>,
): Promise<WorkContractorTemplate> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('work_contractor_email_templates')
      .update(toRow(input))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as WorkContractorTemplateRow);
  });
}

export function deleteWorkContractorTemplate(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('work_contractor_email_templates').delete().eq('id', id);
    if (error) throw error;
  });
}
