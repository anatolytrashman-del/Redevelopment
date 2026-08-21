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
  // 'all' — владелец, видит и может открыть всё. Иначе — список ключей
  // страниц (см. data/pages.ts), остальные показываются в меню серыми
  // с замочком, а прямой переход по ссылке блокируется (RequirePage).
  pages: 'all' | PageKey[];
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/accessProfilesApi.ts
export interface AccessProfileRow {
  id: string;
  password: string;
  display_name: string;
  pages: 'all' | PageKey[];
  created_at: string;
}
