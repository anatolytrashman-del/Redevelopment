import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { DocumentStatus, GeneratedDocument, GeneratedDocumentRow } from '../data/generatedDocuments';

function fromRow(row: GeneratedDocumentRow): GeneratedDocument {
  return {
    id: row.id,
    templateId: row.template_id,
    leadId: row.lead_id,
    title: row.title,
    url: row.url,
    status: row.status as DocumentStatus,
    createdAt: row.created_at,
  };
}

export function fetchGeneratedDocuments(): Promise<GeneratedDocument[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('generated_documents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as GeneratedDocumentRow[]).map(fromRow);
  });
}

export function fetchGeneratedDocumentsForLead(leadId: string): Promise<GeneratedDocument[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('generated_documents')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as GeneratedDocumentRow[]).map(fromRow);
  });
}

export function insertGeneratedDocument(input: {
  templateId: string;
  leadId: string;
  title: string;
  url: string;
}): Promise<GeneratedDocument> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('generated_documents')
      .insert({ template_id: input.templateId, lead_id: input.leadId, title: input.title, url: input.url })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as GeneratedDocumentRow);
  });
}

export function updateGeneratedDocumentStatus(id: string, status: DocumentStatus): Promise<GeneratedDocument> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('generated_documents')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as GeneratedDocumentRow);
  });
}
