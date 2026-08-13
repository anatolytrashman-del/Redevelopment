export interface DocumentTemplate {
  id: string;
  name: string;
  url: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/documentTemplatesApi.ts
export interface DocumentTemplateRow {
  id: string;
  name: string;
  url: string;
}
