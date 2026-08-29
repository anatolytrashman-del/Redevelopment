import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { supabase } from '../../lib/supabase';
import { setAccessProfilesCache, setCurrentUserId } from '../../lib/accessProfile';
import { fetchAccessProfiles } from '../../lib/accessProfilesApi';

// Настоящая авторизация через Supabase Auth (P0.1 аудита безопасности,
// 2026-08-28) — раньше здесь была клиентская заглушка, сверяющая пароль
// в браузере против таблицы, читаемой anon-ключом целиком. Теперь вход —
// supabase.auth.signInWithPassword, а границу данных держит RLS в самой
// базе (access_profiles/остальные таблицы доступны anon-ключу только в том
// объёме, что нужен публичным страницам вне этого гейта — /plan/:token,
// лендинги объектов и т.п., см. scripts/audit-rls.mjs). Сессия хранится
// самим supabase-js (свой localStorage-ключ, не наш) — переживает
// перезагрузку страницы сама, без ручной работы с localStorage здесь.
const LEGACY_LOCALSTORAGE_KEYS = ['redevelopment-unlocked', 'redevelopment-access-profile-id'];

export function PasswordGate({ children }: { children: ReactNode }) {
  const [checkingSession, setCheckingSession] = useState(true);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadProfilesAndUnlock(userId: string) {
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      const profiles = await fetchAccessProfiles();
      setAccessProfilesCache(profiles);
      setCurrentUserId(userId);
      setAuthed(true);
    } catch {
      setProfilesError('Не удалось загрузить доступы. Проверьте соединение и попробуйте снова.');
    } finally {
      setProfilesLoading(false);
    }
  }

  useEffect(() => {
    for (const key of LEGACY_LOCALSTORAGE_KEYS) localStorage.removeItem(key);

    supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user.id;
      if (userId) {
        loadProfilesAndUnlock(userId).finally(() => setCheckingSession(false));
      } else {
        setCheckingSession(false);
      }
    });

    // Реагируем только на выход — вход обрабатывает сам handleSubmit
    // (иначе loadProfilesAndUnlock вызвался бы дважды на один логин).
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthed(false);
        setAccessProfilesCache([]);
        setCurrentUserId(null);
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setLoginError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setLoginError('Неверный email или пароль');
      setSubmitting(false);
      return;
    }
    await loadProfilesAndUnlock(data.user.id);
    setSubmitting(false);
  }

  if (checkingSession || profilesLoading) {
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
        <Button onClick={() => window.location.reload()}>Повторить</Button>
      </div>
    );
  }

  if (authed) return <>{children}</>;

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
          type="email"
          label="Email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setLoginError(null);
          }}
          autoFocus
          required
        />
        <Input
          type="password"
          label="Пароль"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setLoginError(null);
          }}
          state={loginError ? 'error' : 'default'}
          helperText={loginError ?? undefined}
          required
        />
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Входим...' : 'Войти'}
        </Button>
      </form>
    </div>
  );
}
