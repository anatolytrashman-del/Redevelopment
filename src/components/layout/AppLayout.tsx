import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

// index.html — общий статический файл на все роуты (публичный SPA-фолбэк),
// его <title> заточен под OG-превью продающей страницы (см. index.html).
// Для админки просто подменяем document.title на время жизни этого layout
// и возвращаем как было при уходе — без завязки на конкретный текст
// публичного тайтла, чтобы не дублировать его здесь на будущее.
const ADMIN_TITLE = 'Админка Redevelopment';

export function AppLayout() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = ADMIN_TITLE;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="flex min-h-svh bg-bg">
      <Sidebar />
      <main className="min-w-0 flex-1 px-10 py-8">
        <div className="mx-auto flex max-w-[1400px] min-w-0 flex-col gap-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
