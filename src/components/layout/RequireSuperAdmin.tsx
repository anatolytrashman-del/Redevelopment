import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { getCurrentProfile, isSuperAdminAllowed } from '../../lib/accessProfile';

// Строже, чем RequirePage: не пропускает даже профили с pages:'all'
// (Степан, Светлана) — только профиль с явным isSuperAdmin=true (Трэшмен).
// Для страниц, которые не должны быть доступны никому, кроме владельца —
// например лог активности сотрудников.
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const profile = getCurrentProfile();
  if (isSuperAdminAllowed(profile)) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-ink-muted">
      <Lock className="h-8 w-8 text-ink-faint" />
      <p className="text-sm">Эта страница недоступна для вашего доступа.</p>
    </div>
  );
}
