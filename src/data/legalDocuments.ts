import type { DocumentFile } from './contractorDocuments';

// Документы от юристов (нормативка, разъяснения и т.п.) — свободная
// подборка без привязки к лиду/объекту/подрядчику, загружается прямо со
// страницы "Документы" (см. Documents.tsx).
//
// Один документ под общим названием (title) может состоять из нескольких
// файлов — тот же паттерн, что и у ContractorDocument.files.
export interface LegalDocument {
  id: string;
  title: string;
  files: DocumentFile[];
  uploadedAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/legalDocumentsApi.ts
export interface LegalDocumentRow {
  id: string;
  title: string;
  files: DocumentFile[];
  uploaded_at: string;
}
