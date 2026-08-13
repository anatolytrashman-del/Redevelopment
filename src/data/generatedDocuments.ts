export const documentStatuses = [
  'Готов к отправке',
  'Отправлен клиенту',
  'Ждём от клиента',
  'Документ в архиве',
] as const;
export type DocumentStatus = (typeof documentStatuses)[number];

export interface GeneratedDocument {
  id: string;
  templateId: string;
  leadId: string;
  title: string;
  url: string;
  status: DocumentStatus;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/generatedDocumentsApi.ts
export interface GeneratedDocumentRow {
  id: string;
  template_id: string;
  lead_id: string;
  title: string;
  url: string;
  status: string;
  created_at: string;
}
