// Способ связи с партнёром по коллаборации — открытый список (как
// leadContactMethods/financingStatuses), стартовые два варианта из запроса
// владельца, новые можно добавить прямо из формы (AddableSelect).
export const collaborationContactMethods = ['Telegram', 'Email'] as const;

// Статус тоже открытый список, как leadStatuses/financingStatuses.
export const collaborationStatuses = ['Обсуждаем', 'Договорились', 'В работе', 'Приостановлено', 'Завершено'] as const;

export interface Collaboration {
  id: string;
  partner: string;
  contactMethod: string;
  contact: string;
  link: string;
  agreement: string;
  status: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/collaborationsApi.ts
export interface CollaborationRow {
  id: string;
  partner: string;
  contact_method: string | null;
  contact: string | null;
  link: string | null;
  agreement: string | null;
  status: string;
  created_at: string;
}
