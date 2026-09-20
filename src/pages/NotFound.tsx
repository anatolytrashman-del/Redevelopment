import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Home, SearchX } from 'lucide-react';
import { setNoIndex, clearNoIndex } from '../lib/pageMeta';
import { buttonClasses } from '../components/ui/Button';

// 2026-09-02 — Яндекс.Вебмастер: "некорректно настроен возврат HTTP-кода
// 404" — вся страница (любой нераспознанный путь) технически отдаётся с
// кодом 200 (vercel.json — общий SPA-рерайт "/(.*)" -> index.html, без него
// сломалась бы навигация по прямым ссылкам на реальные роуты; это
// стандартное ограничение SPA на статическом хостинге, не баг конкретно
// этого проекта). Настоящий серверный 404 для несуществующих путей при
// такой схеме требует Vercel Edge/Routing Middleware — не сделано в этом
// заходе: домены vercel.com/community.vercel.com в этой песочнице закрыты
// политикой окружения, нет возможности сверить актуальный синтаксис и
// протестировать перед тем, как это уедет на прод. compromise-фикс —
// хотя бы честный noindex (был у ObjectLandingPage.tsx для one-segment
// "объект не найден", здесь — не было вовсе, реальный пробел).
//
// 2026-09-20 — по просьбе владельца страница ссылается на главную ("/"):
// раньше нарочно не давала способа провалиться в основной сайт по клику,
// но выглядела голым логотипом на чёрном фоне без выхода. Ссылка ведёт на
// "/", которая сама редиректит на "/minsk" (см. App.tsx/vercel.json).
export function NotFound() {
  useEffect(() => {
    setNoIndex();
    return () => clearNoIndex();
  }, []);

  return (
    <div className="flex min-h-svh items-center justify-center bg-bg px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-soft text-primary">
          <SearchX className="h-10 w-10" strokeWidth={1.75} />
        </span>
        <div className="flex flex-col items-center gap-2">
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
          <h1 className="text-2xl font-extrabold text-ink">Страница не найдена</h1>
          <p className="max-w-sm text-sm text-ink-muted">
            Такой страницы не существует или она была перемещена. Возможно, ссылка
            устарела или в адресе есть ошибка.
          </p>
        </div>
        <Link to="/" className={buttonClasses('primary')}>
          <Home className="h-4 w-4" strokeWidth={2} />
          На главную
        </Link>
      </div>
    </div>
  );
}
