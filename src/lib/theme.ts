// Тёмная тема платформы (2026-10-22). Класс .dark на <html> ставит инлайн-скрипт
// в index.html до первой отрисовки (без вспышки); здесь — переключение и
// сохранение выбора. Каталоги officelist/malllist всегда светлые.
import { deployedSiteMode } from './sites';

export const THEME_STORAGE_KEY = 'rd-theme';
export type Theme = 'light' | 'dark';

export function themeSupported(): boolean {
  return deployedSiteMode() === 'platform';
}

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function applyTheme(theme: Theme, persist = true): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark' && themeSupported());
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* приватный режим — просто не запоминаем */
    }
  }
}

/** Страховка для сборок каталогов: там тёмной темы нет. */
export function enforceThemeSupport(): void {
  if (typeof document !== 'undefined' && !themeSupported()) {
    document.documentElement.classList.remove('dark');
  }
}
