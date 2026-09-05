import { useEffect } from 'react';
import { setNoIndex, clearNoIndex } from '../lib/pageMeta';

// Нарочно не ссылается ни на одну внутреннюю страницу CRM (в т.ч. на "/") —
// это единственная страница, на которую попадает любой нераспознанный путь,
// и она не должна давать способ провалиться в основной сайт по клику.
//
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
export function NotFound() {
  useEffect(() => {
    setNoIndex();
    return () => clearNoIndex();
  }, []);

  return (
    <div className="flex min-h-svh items-center justify-center bg-bg px-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-lg font-extrabold tracking-wide text-ink">
          <span className="font-black text-primary">RED</span>EVELOPMENT
        </span>
        <p className="text-sm text-ink-muted">Страница не найдена.</p>
      </div>
    </div>
  );
}
