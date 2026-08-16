// Лента общения с лидом: дата + текст, по записи на каждый звонок/встречу/
// переписку. До неё в карточке лида было только поле lastContactedAt (одна
// дата) и status (одна строка) — то есть было видно, что контакт состоялся, но
// не о чём договорились.
//
// Тип заметки (звонок/встреча/сообщение) сознательно не заводим: лишнее поле
// замедляет ввод, а добавить его потом — одна колонка.
export interface LeadNote {
  id: string;
  leadId: string;
  body: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/leadNotesApi.ts
export interface LeadNoteRow {
  id: string;
  lead_id: string;
  body: string;
  created_at: string;
}
