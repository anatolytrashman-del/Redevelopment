export type TemplateFieldType = 'text' | 'date' | 'gender';

// Поле для заполнения — key должен совпадать с меткой {{key}} внутри
// гугл-документа шаблона (см. src/lib/generateDocumentApi.ts).
export interface TemplateField {
  key: string;
  label: string;
  type: TemplateFieldType;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  url: string;
  fields: TemplateField[];
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/documentTemplatesApi.ts
export interface DocumentTemplateRow {
  id: string;
  name: string;
  url: string;
  fields: TemplateField[] | null;
}
