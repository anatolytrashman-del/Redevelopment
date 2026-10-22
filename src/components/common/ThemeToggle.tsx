import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import { applyTheme, currentTheme, themeSupported, THEME_STORAGE_KEY, type Theme } from '../../lib/theme';

/** Круглая кнопка «луна / солнце» — как на дашборде Gambling List. Ставится справа от логотипа. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  // Пока пользователь сам не выбрал тему, следуем за системной.
  useEffect(() => {
    if (!themeSupported() || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        /* нет доступа к хранилищу */
      }
      if (saved) return;
      const next: Theme = e.matches ? 'dark' : 'light';
      applyTheme(next, false);
      setTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (!themeSupported()) return null;
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={() => {
        const next: Theme = dark ? 'light' : 'dark';
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={dark ? 'Светлая тема' : 'Тёмная тема'}
      className={cn(
        'inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface p-0 text-ink transition-colors hover:border-border-strong',
        className,
      )}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-[15px] w-[15px]" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]" aria-hidden="true">
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
