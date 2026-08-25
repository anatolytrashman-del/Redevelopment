import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { TaxDeclaration, TaxDeclarationRow, Quarter } from '../data/taxDeclarations';
import type { DocumentFile } from '../data/contractorDocuments';

function fromRow(row: TaxDeclarationRow): TaxDeclaration {
  return {
    id: row.id,
    legalEntityId: row.legal_entity_id,
    quarter: row.quarter as Quarter,
    year: row.year,
    files: row.files,
    uploadedAt: row.uploaded_at,
  };
}

// Все декларации сразу, не по одному юрлицу — масштаб небольшой (несколько
// юрлиц, несколько деклараций в год у каждого), фильтрация по legalEntityId
// на клиенте, тот же паттерн, что и у fetchContractorDocuments/fetchLegalDocuments.
export function fetchTaxDeclarations(): Promise<TaxDeclaration[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('legal_entity_tax_declarations')
      .select('*')
      .order('year', { ascending: false })
      .order('quarter', { ascending: false });
    if (error) throw error;
    return (data as TaxDeclarationRow[]).map(fromRow);
  });
}

export function insertTaxDeclaration(input: {
  legalEntityId: string;
  quarter: Quarter;
  year: number;
  files: DocumentFile[];
}): Promise<TaxDeclaration> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('legal_entity_tax_declarations')
      .insert({
        legal_entity_id: input.legalEntityId,
        quarter: input.quarter,
        year: input.year,
        files: input.files,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as TaxDeclarationRow);
  });
}

export function deleteTaxDeclaration(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('legal_entity_tax_declarations').delete().eq('id', id);
    if (error) throw error;
  });
}
