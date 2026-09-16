// Способ связи с партнёром по коллаборации — открытый список (как
// leadContactMethods/financingStatuses), стартовые два варианта из запроса
// владельца, новые можно добавить прямо из формы (AddableSelect).
export const collaborationContactMethods = ['Telegram', 'Email'] as const;

// Статус тоже открытый список, как leadStatuses/financingStatuses.
export const collaborationStatuses = [
  'Обсуждаем',
  'Договорились',
  'В работе',
  'Приостановлено',
  'Завершено',
  'Не связывались',
] as const;

// Подписчики в карточке/списке — «32 000»: разряды по три цифры, обычным
// пробелом вместо неразрывного (toLocaleString ставит nbsp).
export function formatAudience(size: number | null): string {
  if (size === null || !Number.isFinite(size)) return '';
  return size.toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
}

export interface Collaboration {
  id: string;
  partner: string;
  contactMethod: string;
  contact: string;
  link: string;
  // Размер аудитории — подписчики канала/паблика, «≈». null = не выяснили
  // (0 — это именно ноль подписчиков, поэтому не `number`, см. правило про
  // числовые "нет данных" в CLAUDE.md).
  audienceSize: number | null;
  // Короткое саммери «что за канал»: тематика, чем полезен нам.
  about: string;
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
  audience_size: number | null;
  about: string | null;
  agreement: string | null;
  status: string;
  created_at: string;
}
