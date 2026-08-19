import type { PageKey } from './pages';

// Профили доступа — вместо одного общего пароля админки (см.
// PasswordGate.tsx) теперь несколько: у каждого свой пароль и свой список
// открытых страниц. Пароли — не полноценная авторизация (см. предупреждение
// в PasswordGate.tsx), тот же уровень защиты, что и раньше, просто на
// несколько "дверей" вместо одной. Новый гостевой доступ — это правка
// массива ниже + деплой, в интерфейсе не настраивается.
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

export const OWNER_PROFILE_ID = 'owner';

export const ACCESS_PROFILES: AccessProfile[] = [
  { id: OWNER_PROFILE_ID, password: '0000', displayName: 'Трэшмен', pages: 'all' },
  { id: 'tatiana', password: '1111', displayName: 'Татьяна Гаврис', pages: ['objects', 'meetingSummaries'] },
];
