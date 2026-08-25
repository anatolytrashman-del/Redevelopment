import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { cn } from '../../lib/cn';
import { glassPillClass, glassPillShadow } from '../../lib/glass';
import { useMarketOfferDiscussionWatcher } from '../../lib/marketOfferDiscussionWatcher';

// index.html — общий статический файл на все роуты (публичный SPA-фолбэк),
// его <title> заточен под OG-превью продающей страницы (см. index.html).
// Для админки просто подменяем document.title на время жизни этого layout
// и возвращаем как было при уходе — без завязки на конкретный текст
// публичного тайтла, чтобы не дублировать его здесь на будущее.
const ADMIN_TITLE = 'Админка Redevelopment';

export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Один опрос на всё приложение, не с каждой страницы — см. сам хук.
  useMarketOfferDiscussionWatcher();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = ADMIN_TITLE;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  // Переход по ссылке из шторки уже закрывает её (см. Sidebar), но роут
  // может смениться и другим путём (кнопка "назад" браузера) — на всякий
  // случай закрываем шторку при любой смене пути.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-svh bg-bg">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Верхняя полоса с гамбургером — только ниже lg, где сайдбар уехал в шторку. */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Открыть меню"
            className={cn('flex h-10 w-10 shrink-0 items-center justify-center text-ink', glassPillClass)}
            style={glassPillShadow}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-base font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
        </div>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto flex max-w-[1400px] min-w-0 flex-col gap-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
