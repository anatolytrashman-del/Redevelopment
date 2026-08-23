import type { PageKey } from './pages';

// Профили доступа — вместо одного общего пароля админки (см.
// PasswordGate.tsx) несколько: у каждого свой пароль и свой список
// открытых страниц. Пароли — не полноценная авторизация (см. предупреждение
// в PasswordGate.tsx), тот же уровень защиты, что и раньше, просто на
// несколько "дверей" вместо одной. Живут в таблице access_profiles
// (см. lib/accessProfilesApi.ts) — редактируются прямо из /admin/settings,
// без правки кода и деплоя.
export interface AccessProfile {
  id: string;
  password: string;
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
  password: string;
  display_name: string;
  pages: 'all' | PageKey[];
  is_super_admin: boolean;
  created_at: string;
}
