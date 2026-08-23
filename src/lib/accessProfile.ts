import type { AccessProfile } from '../data/accessProfiles';
import type { PageKey } from '../data/pages';

const PROFILE_STORAGE_KEY = 'redevelopment-access-profile-id';
// Флаг единого пароля из версии до профилей доступа — сессии, у которых
// он уже стоял, но profile-id ещё нет, считаем владельцем: иначе все, кто
// уже был залогинен, разлогинились бы при обновлении платформы.
const LEGACY_UNLOCKED_KEY = 'redevelopment-unlocked';

// Профили теперь живут в Supabase (access_profiles), а не в статическом
// массиве — но Sidebar/RequirePage/AdminIndex читают текущий профиль
// синхронно на каждый рендер, без своего useEffect/loading. Поэтому
// PasswordGate загружает список один раз при монтировании (до того, как
// отрисуются любые дети) и кладёт сюда — дальше весь модуль работает как
// раньше, просто источник данных не хардкод, а кэш из этой переменной.
let cachedProfiles: AccessProfile[] = [];

export function setAccessProfilesCache(profiles: AccessProfile[]): void {
  cachedProfiles = profiles;
}

export function findProfileByPassword(password: string): AccessProfile | null {
  return cachedProfiles.find((p) => p.password === password) ?? null;
}

export function hasStoredAccess(): boolean {
  return localStorage.getItem(PROFILE_STORAGE_KEY) != null || localStorage.getItem(LEGACY_UNLOCKED_KEY) === '1';
}

export function unlockProfile(profile: AccessProfile): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, profile.id);
  localStorage.setItem(LEGACY_UNLOCKED_KEY, '1');
}

export function lockAccess(): void {
  localStorage.removeItem(PROFILE_STORAGE_KEY);
  localStorage.removeItem(LEGACY_UNLOCKED_KEY);
}

// Фолбэк, если id из localStorage не находится среди загруженных профилей
// (профиль удалили, либо старая legacy-сессия без profile-id вовсе) —
// раньше был фиксированный OWNER_PROFILE_ID='owner', теперь id из базы
// (uuid), поэтому берём первый профиль с полным доступом, а если такого
// вовсе нет — первый по списку.
export function getCurrentProfile(): AccessProfile {
  const id = localStorage.getItem(PROFILE_STORAGE_KEY);
  const found = cachedProfiles.find((p) => p.id === id);
  if (found) return found;
  return cachedProfiles.find((p) => p.pages === 'all') ?? cachedProfiles[0];
}

export function isPageAllowed(profile: AccessProfile, page: PageKey): boolean {
  return profile.pages === 'all' || profile.pages.includes(page);
}

// Отдельная, более строгая проверка для страниц, скрытых даже от профилей
// с pages:'all' (например лог активности сотрудников) — см. isSuperAdmin в
// data/accessProfiles.ts. Использовать вместо isPageAllowed там, где обычное
// "all" не должно давать доступ.
export function isSuperAdminAllowed(profile: AccessProfile): boolean {
  return profile.isSuperAdmin;
}
