import type { PageKey } from './pages';

// Профили доступа — привязаны к настоящему Supabase Auth пользователю
// (см. PasswordGate.tsx, вход через supabase.auth.signInWithPassword).
// У каждого свой список открытых страниц. Аккаунты заводятся вручную через
// Supabase Auth Admin API (не из этой формы — /admin/settings редактирует
// только display_name/pages для УЖЕ существующего аккаунта, создать новый
// логин отсюда нельзя, см. комментарий в lib/accessProfilesApi.ts). Живут
// в таблице access_profiles — редактируются прямо из /admin/settings, без
// правки кода и деплоя.
export interface AccessProfile {
  id: string;
  // auth.users.id — по нему PasswordGate находит "свой" профиль после
  // входа (см. getCurrentProfile в lib/accessProfile.ts).
  userId: string;
  // Показывается в сайдбаре ("вы вошли как...") и в /admin/settings.
  displayName: string;
  // 'all' — видит и может открыть все ОБЫЧНЫЕ страницы (см. data/pages.ts).
  // Иначе — список ключей страниц, остальные показываются в меню серыми
  // с замочком, а прямой переход по ссылке блокируется (RequirePage).
  // Не включает супер-доступ (см. isSuperAdmin) — это отдельное измерение,
  // "all" не даёт автоматически скрытые от всех разделы вроде лога
  // активности сотрудников.
  pages: 'all' | PageKey[];
  // Флаг "выше, чем all" — только для страниц, которые не должны быть
  // доступны никому, кроме владельца, даже если у профиля pages:'all'
  // (например Степан/Светлана — полный доступ к обычным разделам, но не к
  // логу активности). См. isSuperAdminAllowed в lib/accessProfile.ts.
  isSuperAdmin: boolean;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/accessProfilesApi.ts
export interface AccessProfileRow {
  id: string;
  user_id: string;
  display_name: string;
  pages: 'all' | PageKey[];
  is_super_admin: boolean;
  created_at: string;
}
