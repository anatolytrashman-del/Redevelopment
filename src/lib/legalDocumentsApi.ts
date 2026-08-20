import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { LegalDocument, LegalDocumentRow } from '../data/legalDocuments';

function fromRow(row: LegalDocumentRow): LegalDocument {
  return {
    id: row.id,
    title: row.title,
    fileUrl: row.file_url,
    fileName: row.file_name,
    uploadedAt: row.uploaded_at,
  };
}

export function fetchLegalDocuments(): Promise<LegalDocument[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('legal_documents').select('*').order('uploaded_at', { ascending: false });
    if (error) throw error;
    return (data as LegalDocumentRow[]).map(fromRow);
  });
}

export function insertLegalDocument(input: { title: string; fileUrl: string; fileName: string }): Promise<LegalDocument> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('legal_documents')
      .insert({ title: input.title, file_url: input.fileUrl, file_name: input.fileName })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as LegalDocumentRow);
  });
}

export function deleteLegalDocument(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('legal_documents').delete().eq('id', id);
    if (error) throw error;
  });
}
