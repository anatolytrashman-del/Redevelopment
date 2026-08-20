// Документы от юристов (нормативка, разъяснения и т.п.) — свободная
// подборка без привязки к лиду/объекту/подрядчику, загружается прямо со
// страницы "Документы" (см. Documents.tsx).
export interface LegalDocument {
  id: string;
  title: string;
  fileUrl: string;
  fileName: string;
  uploadedAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/legalDocumentsApi.ts
export interface LegalDocumentRow {
  id: string;
  title: string;
  file_url: string;
  file_name: string;
  uploaded_at: string;
}
