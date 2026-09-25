// Согласие на cookie (владелец, 2026-09-25) — единственный источник
// правды: localStorage-ключ 'cookie-consent', значения 'all' (аналитика
// разрешена) или 'necessary' (только необходимые). Читается и пишется
// отсюда и баннером (CookieBanner.tsx), и инлайн-скриптами в index.html
// (там копия логики на голом JS — ФАЙЛ-БЛИЗНЕЦ, см. CLAUDE.md: счётчики
// стартуют раньше бандла, поэтому решение "запускать ли Метрику/VK" не
// может ждать React).
//
// window.__startAnalytics — функция, которую кладёт index.html: запускает
// отложенную вставку тегов Метрики и Top.Mail.Ru, если они ещё не были
// запущены. Определена всегда (бот/prerender/admin проверяются внутри неё
// же), поэтому её достаточно один раз дёрнуть по клику "Принять все" —
// никакой перезагрузки страницы не требуется.
export const COOKIE_CONSENT_KEY = 'cookie-consent';
export type CookieConsentValue = 'all' | 'necessary';

export function getCookieConsent(): CookieConsentValue | null {
  try {
    const value = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    return value === 'all' || value === 'necessary' ? value : null;
  } catch {
    return null;
  }
}

export function setCookieConsent(value: CookieConsentValue) {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    // приватный режим/заблокированный storage — согласие просто не
    // запомнится, баннер покажется заново в следующий раз, не критично.
  }
  if (value === 'all') {
    try {
      (window as unknown as { __startAnalytics?: () => void }).__startAnalytics?.();
    } catch {
      // не должно падать никогда, но счётчики — не то, из-за чего стоит
      // ронять взаимодействие пользователя с баннером.
    }
  }
}
