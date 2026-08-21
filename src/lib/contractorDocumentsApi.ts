import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { ContractorDocument, ContractorDocumentRow, DocumentFile } from '../data/contractorDocuments';

function fromRow(row: ContractorDocumentRow): ContractorDocument {
  return {
    id: row.id,
    contractorId: row.contractor_id,
    files: row.files,
    uploadedAt: row.uploaded_at,
  };
}

export function fetchContractorDocuments(): Promise<ContractorDocument[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('contractor_documents')
      .select('*')
      .order('uploaded_at', { ascending: false });
    if (error) throw error;
    return (data as ContractorDocumentRow[]).map(fromRow);
  });
}

export function insertContractorDocument(input: { contractorId: string; files: DocumentFile[] }): Promise<ContractorDocument> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('contractor_documents')
      .insert({ contractor_id: input.contractorId, files: input.files })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as ContractorDocumentRow);
  });
}

export function deleteContractorDocument(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('contractor_documents').delete().eq('id', id);
    if (error) throw error;
  });
}
