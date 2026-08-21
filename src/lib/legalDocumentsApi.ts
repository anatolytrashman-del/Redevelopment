import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { LegalDocument, LegalDocumentRow } from '../data/legalDocuments';
import type { DocumentFile } from '../data/contractorDocuments';

function fromRow(row: LegalDocumentRow): LegalDocument {
  return {
    id: row.id,
    title: row.title,
    files: row.files,
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

export function insertLegalDocument(input: { title: string; files: DocumentFile[] }): Promise<LegalDocument> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('legal_documents')
      .insert({ title: input.title, files: input.files })
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
