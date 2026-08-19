import { ACCESS_PROFILES, OWNER_PROFILE_ID, type AccessProfile } from '../data/accessProfiles';
import type { PageKey } from '../data/pages';

const PROFILE_STORAGE_KEY = 'redevelopment-access-profile-id';
// Флаг единого пароля из версии до профилей доступа — сессии, у которых
// он уже стоял, но profile-id ещё нет, считаем владельцем: иначе все, кто
// уже был залогинен, разлогинились бы при обновлении платформы.
const LEGACY_UNLOCKED_KEY = 'redevelopment-unlocked';

export function findProfileByPassword(password: string): AccessProfile | null {
  return ACCESS_PROFILES.find((p) => p.password === password) ?? null;
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

export function getCurrentProfile(): AccessProfile {
  const id = localStorage.getItem(PROFILE_STORAGE_KEY);
  const found = ACCESS_PROFILES.find((p) => p.id === id);
  if (found) return found;
  return ACCESS_PROFILES.find((p) => p.id === OWNER_PROFILE_ID)!;
}

export function isPageAllowed(profile: AccessProfile, page: PageKey): boolean {
  return profile.pages === 'all' || profile.pages.includes(page);
}
