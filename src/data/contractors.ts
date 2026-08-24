// Один и тот же список подрядчиков — деление на "команду" и "обычных
// подрядчиков" держится не отдельными таблицами, а одним открытым полем
// teamTier (см. Contractor.teamTier ниже), тем же паттерном, что и
// specialty/status у других сущностей: пресет плюс своё значение из формы.
// Пусто — обычный подрядчик, показывается в общем списке.

// Открытый список, как leadRequirements/leadStatuses — пользователь может
// добавить свою специальность прямо из формы.
export const contractorSpecialties = ['Юрист', 'Налоговый консультант', 'Электрик'] as const;

// Тот же паттерн, что leadContactMethods, но без Kufar — подрядчиков там не ищут.
export const contractorContactMethods = ['Телефон', 'Telegram', 'WhatsApp', 'Viber', 'Email'] as const;

// "Команда" — те, кто 24/7 на связи (сейчас никого); "Part-time" —
// доверенные консультанты по запросу (юрист, налоговый консультант). Открытый
// список — свой вариант добавляется прямо из формы, как и специальность.
// Каждое непустое значение получает на странице собственный закреплённый блок
// (см. Contractors.tsx), а не только эти два конкретных.
export const contractorTeamTiers = ['Команда', 'Part-time'] as const;

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
  // Отдельно от notes — предоплата/постоплата, ставка, реквизиты и т.п.
  // Держим отдельным полем, а не смешиваем со свободными заметками о качестве
  // работы: разные по природе вещи, в детальной карточке показываются
  // отдельным блоком.
  paymentTerms: string;
  // Пусто — обычный подрядчик. "Команда"/"Part-time" или своё
  // значение — см. contractorTeamTiers выше.
  teamTier: string;
  // Свободный текст, заполняется вручную (не связан с объектами базы) —
  // за какую площадку/район/направление отвечает.
  responsibilityZone: string;
  // Путь файла в приватном бакете contractor-photos, не готовый URL — тот же
  // паттерн, что и у Lead.photoPath (см. lib/contractorsApi.ts). Для
  // всех, у кого teamTier заполнен, подтягивается автоматически из Telegram.
  photoPath: string;
  // Резюме (например, для кандидата, найденного на hh) — тот же паттерн
  // приватного бакета и подписанной ссылки, что и у photoPath, только
  // бакет contractor-resumes и произвольный тип файла (pdf/doc/docx), не
  // только изображение. resumeFileName — исходное имя файла, отдельно от
  // resumePath: путь в бакете это crypto.randomUUID() + расширение (как и
  // у фото), по нему нельзя показать пользователю осмысленное имя файла
  // при скачивании.
  resumePath: string;
  resumeFileName: string;
  // Дата рождения — полная (с годом, формат <input type="date">, "YYYY-MM-DD"),
  // но для поздравлений важен только день и месяц (см. isBirthdayToday ниже).
  // Год хранится просто потому, что так отдаёт обычный date-инпут, отдельно
  // нигде не используется. Пусто — не указана.
  birthday: string;
  createdAt: string;
}

// Сегодня у подрядчика день рождения — сравниваем только месяц и день,
// год не важен. birthday — это "YYYY-MM-DD" (native-формат value у
// <input type="date">, тот же, что отдаёт Postgres-колонка типа date через
// Supabase), поэтому сравнение срезом строки надёжнее, чем через Date:
// не зависит от часового пояса браузера.
export function isBirthdayToday(birthday: string): boolean {
  if (!birthday) return false;
  const today = new Date();
  const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return birthday.slice(5, 10) === monthDay;
}

// Когда способ связи — Телефон или Email, contact на практике держит то же
// самое значение, что и отдельные поля phone/email (форма и заполняется
// именно так) — тогда карточка показывала бы одну и ту же строку дважды.
// Сравниваем буквально, а не просто по contactMethod: если когда-нибудь
// заполнят по-разному, ничего не прячем и не теряем данные.
export function contactDuplicatesDedicatedField(
  c: Pick<Contractor, 'contact' | 'contactMethod' | 'phone' | 'email'>,
): boolean {
  if (c.contactMethod === 'Телефон' && c.contact === c.phone) return true;
  if (c.contactMethod === 'Email' && c.contact === c.email) return true;
  return false;
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
  payment_terms: string | null;
  team_tier: string | null;
  responsibility_zone: string | null;
  photo_path: string | null;
  birth_date: string | null;
  resume_path: string | null;
  resume_file_name: string | null;
  created_at: string;
}
