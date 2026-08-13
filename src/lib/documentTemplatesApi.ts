import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { DocumentTemplate, DocumentTemplateRow } from '../data/documentTemplates';

function fromRow(row: DocumentTemplateRow): DocumentTemplate {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    fields: row.fields ?? [],
  };
}

export function fetchDocumentTemplates(): Promise<DocumentTemplate[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('document_templates')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as DocumentTemplateRow[]).map(fromRow);
  });
}

export function insertDocumentTemplate(input: Omit<DocumentTemplate, 'id'>): Promise<DocumentTemplate> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('document_templates')
      .insert({ name: input.name, url: input.url, fields: input.fields })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as DocumentTemplateRow);
  });
}

export function updateDocumentTemplate(id: string, input: Omit<DocumentTemplate, 'id'>): Promise<DocumentTemplate> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('document_templates')
      .update({ name: input.name, url: input.url, fields: input.fields })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as DocumentTemplateRow);
  });
}
