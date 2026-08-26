import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { AvangardDocument, AvangardDocumentRow } from '../data/avangardDocuments';
import type { DocumentFile } from '../data/contractorDocuments';

function fromRow(row: AvangardDocumentRow): AvangardDocument {
  return {
    id: row.id,
    title: row.title,
    files: row.files,
    uploadedAt: row.uploaded_at,
  };
}

export function fetchAvangardDocuments(): Promise<AvangardDocument[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('avangard_documents').select('*').order('uploaded_at', { ascending: false });
    if (error) throw error;
    return (data as AvangardDocumentRow[]).map(fromRow);
  });
}

export function insertAvangardDocument(input: { title: string; files: DocumentFile[] }): Promise<AvangardDocument> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('avangard_documents')
      .insert({ title: input.title, files: input.files })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as AvangardDocumentRow);
  });
}

export function deleteAvangardDocument(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('avangard_documents').delete().eq('id', id);
    if (error) throw error;
  });
}
