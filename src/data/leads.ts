export const leadSources = ['Kufar', 'Realt', 'Сайт'] as const;
export type LeadSource = (typeof leadSources)[number];

// Список требований открытый — новые значения можно добавлять прямо
// из формы лида, как и категории транзакций.
export const leadRequirements = ['Мокрая точка'] as const;

// Тоже открытый список (см. leadRequirements) — канал связи с лидом, не
// путать с source (откуда лид пришёл): один и тот же лид с Kufar можно
// потом вести в Telegram.
export const leadContactMethods = ['Телефон', 'Telegram', 'Kufar', 'WhatsApp', 'Viber', 'Email'] as const;

// Тоже открытый список (см. leadRequirements) — зачем клиенту кабинет:
// себе под бизнес или сдавать/перепродавать.
export const leadClientTypes = ['Конечный покупатель', 'Инвестор'] as const;

// Статус лида. Раньше был свободным текстом (обычный Input), из-за чего один
// и тот же этап писался по-разному и воронку было не построить. Теперь тот же
// открытый список, что и у requirement/clientType: колонка в базе осталась
// текстовой, ограничение только на вводе — старые значения не ломаются, свой
// статус по-прежнему можно добавить прямо из формы.
export const leadStatuses = [
  'Первичный контакт',
  'Показ назначен',
  'Думает',
  'Заявка на бронирование',
  'Сделка',
  'Отказ',
] as const;

// Статус, который жёстко ставится при брони с сайта (PublicPlanAndUnits.tsx) и
// по которому Leads.tsx помечает бронь как ещё не подтверждённую менеджером.
// Держим здесь, а не двумя строковыми литералами в разных файлах: сравнение
// идёт посимвольно, и при расхождении отметка тихо перестала бы показываться.
// Обязан присутствовать в leadStatuses выше.
export const NEW_BOOKING_LEAD_STATUS = 'Заявка на бронирование';

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
  // Отдельно от contact: даже если contact — телеграм-ник (для кликабельной
  // ссылки на диалог), номер телефона всё равно нужен отдельно — не все
  // способы связи заменяют звонок.
  phone: string;
  // Тег типа клиента (Конечный покупатель / Инвестор) — растущий список,
  // как requirement/contactMethod.
  clientType: string;
  status: string;
  isWarm: boolean;
  objectId: string;
  // Путь файла в приватном бакете lead-photos, НЕ готовый URL: бакет закрытый,
  // ссылки на фото подписанные и живут час, поэтому хранить их в базе
  // бессмысленно — см. uploadLeadPhoto/createLeadPhotoUrl в leadsApi.ts.
  // Пустая строка — фото не загружено.
  photoPath: string;
  // Ставится базой при создании, никогда не редактируется вручную — см.
  // Omit<Lead, 'id' | 'createdAt'> в insertLead/updateLead.
  createdAt: string;
  // В отличие от createdAt — правится вручную, менеджер отмечает дату
  // последнего разговора с лидом. Пустая строка — контакта ещё не было.
  // Проставляется автоматически при добавлении заметки (см. leadNotesApi.ts).
  lastContactedAt: string;
  // Когда с лидом нужно связаться в следующий раз. Без этого поля лиды
  // теряются молча: видно, что контакт был, но не видно, что он просрочен.
  // Пустая строка — следующий контакт не запланирован.
  nextContactAt: string;
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
  phone: string | null;
  client_type: string | null;
  status: string;
  is_warm: boolean;
  object_id: string | null;
  photo_path: string | null;
  created_at: string;
  last_contacted_at: string | null;
  next_contact_at: string | null;
}
