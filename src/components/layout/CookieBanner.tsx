import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import { getCookieConsent, setCookieConsent } from '../../lib/cookieConsent';
import { isLikelyBot } from '../../lib/botDetection';
import { deployedSiteMode } from '../../lib/sites';

// Уведомление о cookie (владелец, 2026-09-25, текст — docs/legal, верстаем
// 1:1). Показывается только на публичной части (не /admin — там сотрудники,
// не посетители сайта), только пока нет сохранённого выбора, и никогда во
// время пререндер-снапшота (?prerender=1 — тот же принцип, что у счётчиков
// в index.html: build-сервер не должен решать за реального посетителя) и
// для ботов/краулеров (isLikelyBot — тот же флаг, что у счётчиков).
//
// Фиксированная позиция снизу — не сдвигает контент страницы (без
// layout shift), и переоткрывается в любой момент ссылкой "Настройки
// cookie" в подвале (см. CookieFooterLinks.tsx) через custom-событие
// 'cookie-banner:reopen', которое слушает этот же компонент.
export function CookieBanner() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      setVisible(false);
      return;
    }
    if (isLikelyBot()) return;
    try {
      if (new URLSearchParams(location.search).get('prerender') === '1') return;
    } catch {
      // URLSearchParams не должен падать в браузере, но на всякий случай
      // просто не показываем баннер, а не роняем страницу.
    }
    if (getCookieConsent() === null) setVisible(true);
  }, [location.pathname, location.search]);

  useEffect(() => {
    function reopen() {
      if (!location.pathname.startsWith('/admin')) setVisible(true);
    }
    window.addEventListener('cookie-banner:reopen', reopen);
    return () => window.removeEventListener('cookie-banner:reopen', reopen);
  }, [location.pathname]);

  if (!visible) return null;

  // PSI mobile (не бот) видит баннер. Кнопки py-0.5 / 11px ниже 24px —
  // target-size. Крупнее только на malllist, остальные сайты без изменений.
  const malls = deployedSiteMode() === 'malls';
  const choiceHit = malls ? 'inline-flex min-h-6 items-center justify-center px-2.5' : 'px-1.5 py-0.5';

  function choose(value: 'all' | 'necessary') {
    setCookieConsent(value);
    setVisible(false);
  }

  return (
    <div className="fixed bottom-20 right-3 z-40 sm:bottom-4 sm:right-4">
      <div
        className={cn('flex max-w-[230px] flex-wrap items-center gap-x-2 gap-y-1 sm:max-w-none sm:flex-nowrap rounded-xl px-2.5 py-1.5 text-[11px] text-ink-muted border border-black/5 bg-white/95 backdrop-blur-xl')}
        style={glassCardShadow}
      >
        <p className="leading-snug sm:whitespace-nowrap">
          Используем cookie для аналитики.{' '}
          <Link to="/privacy" className={cn('underline hover:text-primary', malls && 'inline-flex min-h-6 items-center')}>
            Подробнее
          </Link>
        </p>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => choose('necessary')}
            className={cn('rounded-full font-medium text-ink-muted hover:text-ink', choiceHit)}
          >
            Отклонить
          </button>
          <button
            type="button"
            onClick={() => choose('all')}
            className={cn('rounded-full bg-black font-semibold text-white hover:bg-neutral-800', malls ? 'inline-flex min-h-6 items-center justify-center px-2.5' : 'px-2.5 py-0.5')}
          >
            Принять
          </button>
        </div>
      </div>
    </div>
  );
}

export function reopenCookieBanner() {
  window.dispatchEvent(new Event('cookie-banner:reopen'));
}
