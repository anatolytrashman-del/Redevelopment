// Сканы договоров с подрядчиками — отдельная таблица, а не поле на
// Contractor: не хотим трогать общую форму подрядчика (Contractors.tsx) ради
// этого, загрузка происходит прямо со страницы "Документы" (см. Documents.tsx).
export interface ContractorDocument {
  id: string;
  contractorId: string;
  fileUrl: string;
  fileName: string;
  uploadedAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/contractorDocumentsApi.ts
export interface ContractorDocumentRow {
  id: string;
  contractor_id: string;
  file_url: string;
  file_name: string;
  uploaded_at: string;
}
