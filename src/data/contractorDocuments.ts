// Сканы договоров с подрядчиками — отдельная таблица, а не поле на
// Contractor: не хотим трогать общую форму подрядчика (Contractors.tsx) ради
// этого, загрузка происходит прямо со страницы "Документы" (см. Documents.tsx).
//
// Один договор — это часто пакет из нескольких файлов (например, сам
// договор + акт + приложение), поэтому files — массив, а не одно поле.
export interface DocumentFile {
  url: string;
  fileName: string;
}

export interface ContractorDocument {
  id: string;
  contractorId: string;
  files: DocumentFile[];
  uploadedAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/contractorDocumentsApi.ts
export interface ContractorDocumentRow {
  id: string;
  contractor_id: string;
  files: DocumentFile[];
  uploaded_at: string;
}
