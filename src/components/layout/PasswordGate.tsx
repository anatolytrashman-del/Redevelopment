import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { findProfileByPassword, hasStoredAccess, setAccessProfilesCache, unlockProfile } from '../../lib/accessProfile';
import { fetchAccessProfiles } from '../../lib/accessProfilesApi';

// Это не настоящая авторизация — фронтенд статический, без бэкенда, а
// Supabase-запросы уже работают с открытым anon-ключом без какого-либо
// токена. Это просто клиентская заглушка, которая отсекает случайных
// посетителей корня сайта: любой, кто откроет DevTools, может обойти
// проверку или прочитать пароль прямо в собранном JS. Публичная страница
// планировки (/plan/:token) находится вне этого гейта и его не требует.
//
// Профилей доступа несколько (см. data/accessProfiles.ts, редактируются в
// /admin/settings) — у каждого свой пароль и свой список открытых страниц
// (проверяется дальше в Sidebar.tsx/RequirePage.tsx), не только "пустил /
// не пустил". Список грузится здесь один раз при монтировании и кладётся в
// общий кэш (setAccessProfilesCache) — Sidebar/RequirePage/AdminIndex читают
// текущий профиль синхронно на каждый рендер, без своего useEffect, поэтому
// дети этого компонента не рендерятся, пока профили не загружены (иначе
// getCurrentProfile() увидел бы пустой кэш).
export function PasswordGate({ children }: { children: ReactNode }) {
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(() => hasStoredAccess());
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, []);

  function loadProfiles() {
    setProfilesLoading(true);
    setProfilesError(null);
    fetchAccessProfiles()
      .then(setAccessProfilesCache)
      .catch(() => setProfilesError('Не удалось загрузить доступы. Проверьте соединение и попробуйте снова.'))
      .finally(() => setProfilesLoading(false));
  }

  if (profilesLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-bg">
        <Loader2 className="h-6 w-6 animate-spin text-ink-faint" />
      </div>
    );
  }

  if (profilesError) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bg px-4 text-center">
        <p className="text-sm text-danger">{profilesError}</p>
        <Button onClick={loadProfiles}>Повторить</Button>
      </div>
    );
  }

  if (unlocked) return <>{children}</>;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const profile = findProfileByPassword(password);
    if (profile) {
      unlockProfile(profile);
      setUnlocked(true);
    } else {
      setError(true);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-bg px-4">
      <form
        onSubmit={handleSubmit}
        className={cn('flex w-full max-w-xs flex-col gap-4 p-6', glassCardClass)}
        style={glassCardShadow}
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
          <span className="text-xs text-ink-faint">Внутренняя панель — доступ только для сотрудников</span>
        </div>
        <Input
          type="password"
          label="Пароль"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(false);
          }}
          state={error ? 'error' : 'default'}
          helperText={error ? 'Неверный пароль' : undefined}
          autoFocus
        />
        <Button type="submit" className="w-full">
          Войти
        </Button>
      </form>
    </div>
  );
}
