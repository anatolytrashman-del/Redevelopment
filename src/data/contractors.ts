// Один и тот же список: разница между "постоянной командой" (юрист,
// налоговый консультант — те, кого уже проверили и держат под рукой) и
// обычным подрядчиком (строитель, электрик...) — не в структуре данных,
// а в одном признаке isCoreTeam. Сегодняшний разовый электрик завтра может
// стать частью команды — это тумблер, а не миграция между таблицами.

// Открытый список, как leadRequirements/leadStatuses — пользователь может
// добавить свою специальность прямо из формы.
export const contractorSpecialties = ['Юрист', 'Налоговый консультант', 'Электрик'] as const;

// Тот же паттерн, что leadContactMethods, но без Kufar — подрядчиков там не ищут.
export const contractorContactMethods = ['Телефон', 'Telegram', 'WhatsApp', 'Viber', 'Email'] as const;

export interface Contractor {
  id: string;
  name: string;
  specialty: string;
  contact: string;
  // Определяет, как contact превращается в кликабельную ссылку на диалог —
  // см. buildDialogLink в components/ui/ContactValue.tsx.
  contactMethod: string;
  // Отдельно от contact — так же, как у лидов (Lead.phone): даже если contact
  // держит телеграм-юзернейм для быстрой ссылки на диалог, телефон и email
  // нужны отдельно и всегда на виду, а не только когда именно они выбраны
  // способом связи.
  phone: string;
  email: string;
  // Свободный текст, не лента с датами (как история общения у лида) —
  // подрядчику обычно достаточно одной обновляемой заметки "плюсы/минусы",
  // без хронологии звонков.
  notes: string;
  isCoreTeam: boolean;
  // Путь файла в приватном бакете contractor-photos, не готовый URL — тот же
  // паттерн, что и у Lead.photoPath (см. lib/contractorsApi.ts). Для
  // постоянной команды подтягивается автоматически из Telegram.
  photoPath: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/contractorsApi.ts
export interface ContractorRow {
  id: string;
  name: string;
  specialty: string;
  contact: string;
  contact_method: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_core_team: boolean;
  photo_path: string | null;
  created_at: string;
}
