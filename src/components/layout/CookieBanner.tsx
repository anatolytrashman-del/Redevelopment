import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { buttonClasses } from '../ui/Button';
import { getCookieConsent, setCookieConsent } from '../../lib/cookieConsent';
import { isLikelyBot } from '../../lib/botDetection';

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

  function choose(value: 'all' | 'necessary') {
    setCookieConsent(value);
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:px-6 sm:pb-6">
      <div
        className={cn(
          'mx-auto flex max-w-3xl flex-col gap-3 p-4 text-sm text-ink sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5',
          glassCardClass,
        )}
        style={glassCardShadow}
      >
        <p className="leading-relaxed text-ink-muted">
          Мы используем cookie. Необходимые нужны для работы сайта. Аналитические и рекламные
          (Яндекс.Метрика, VK) помогают понять, как пользуются сайтом, и включаются только
          с вашего согласия. Подробнее — в{' '}
          <Link to="/privacy" className="font-semibold text-ink underline hover:text-primary">
            Политике обработки персональных данных
          </Link>
          .
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => choose('necessary')} className={buttonClasses('secondary')}>
            Только необходимые
          </button>
          <button type="button" onClick={() => choose('all')} className={buttonClasses('primary')}>
            Принять все
          </button>
        </div>
      </div>
    </div>
  );
}

// Дёргается ссылкой "Настройки cookie" из подвала — переоткрывает баннер,
// не сбрасывая сохранённый выбор (человек сам решит, менять его или нет).
export function reopenCookieBanner() {
  window.dispatchEvent(new Event('cookie-banner:reopen'));
}
