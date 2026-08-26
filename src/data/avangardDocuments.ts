import type { DocumentFile } from './contractorDocuments';

// Документы по "Авангарду" — своя вкладка на странице "Документы", тот же
// принцип, что и у LegalDocument (data/legalDocuments.ts): свободная
// подборка без привязки к лиду/объекту/подрядчику, каждый документ под
// общим названием может состоять из нескольких файлов.
export interface AvangardDocument {
  id: string;
  title: string;
  files: DocumentFile[];
  uploadedAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/avangardDocumentsApi.ts
export interface AvangardDocumentRow {
  id: string;
  title: string;
  files: DocumentFile[];
  uploaded_at: string;
}
