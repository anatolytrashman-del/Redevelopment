export const leadSources = ['Kufar', 'Realt', 'Сайт'] as const;
export type LeadSource = (typeof leadSources)[number];

// Список требований открытый — новые значения можно добавлять прямо
// из формы лида, как и категории транзакций.
export const leadRequirements = ['Мокрая точка'] as const;

// Тоже открытый список (см. leadRequirements) — канал связи с лидом, не
// путать с source (откуда лид пришёл): один и тот же лид с Kufar можно
// потом вести в Telegram.
export const leadContactMethods = ['Телефон', 'Telegram', 'Kufar', 'WhatsApp', 'Viber', 'Email'] as const;

export interface Lead {
  id: string;
  name: string;
  source: LeadSource;
  businessType: string;
  area: string;
  requirement: string;
  contact: string;
  // Способ связи (Телефон/Telegram/Kufar/...) — определяет, как contact
  // превращается в кликабельную ссылку на диалог, см. buildDialogLink в
  // Leads.tsx.
  contactMethod: string;
  status: string;
  isWarm: boolean;
  objectId: string;
  // Ставится базой при создании, никогда не редактируется вручную — см.
  // Omit<Lead, 'id' | 'createdAt'> в insertLead/updateLead.
  createdAt: string;
  // В отличие от createdAt — правится вручную, менеджер отмечает дату
  // последнего разговора с лидом. Пустая строка — контакта ещё не было.
  lastContactedAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/leadsApi.ts
export interface LeadRow {
  id: string;
  name: string;
  source: string;
  business_type: string;
  area: string;
  requirement: string;
  contact: string;
  contact_method: string | null;
  status: string;
  is_warm: boolean;
  object_id: string | null;
  created_at: string;
  last_contacted_at: string | null;
}
