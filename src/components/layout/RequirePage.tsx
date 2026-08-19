import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { getCurrentProfile, isPageAllowed } from '../../lib/accessProfile';
import type { PageKey } from '../../data/pages';

// Второй слой проверки доступа, кроме серого пункта в сайдбаре (см.
// Sidebar.tsx) — тот прячет ссылку из меню, но не мешает открыть страницу
// напрямую по URL (например, если её уже открывали раньше и она в истории
// браузера). Оборачивает каждый защищённый <Route> в App.tsx.
export function RequirePage({ page, children }: { page: PageKey; children: ReactNode }) {
  const profile = getCurrentProfile();
  if (isPageAllowed(profile, page)) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-ink-muted">
      <Lock className="h-8 w-8 text-ink-faint" />
      <p className="text-sm">Эта страница недоступна для вашего доступа.</p>
    </div>
  );
}
