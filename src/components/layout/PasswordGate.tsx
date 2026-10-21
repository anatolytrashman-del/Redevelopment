import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { supabase } from '../../lib/supabase';
import { setAccessProfilesCache, setCurrentUserId } from '../../lib/accessProfile';
import { fetchAccessProfiles } from '../../lib/accessProfilesApi';
import { LOGIN_ACCOUNTS, type LoginAccount } from '../../data/loginAccounts';
import {
  RATE_LIMIT_WAIT_MS,
  classifyLoginError,
  loginErrorMessage,
  refineWithAccountCheck,
  type AccountCheck,
  type LoginErrorInfo,
} from '../../lib/loginErrors';

// Настоящая авторизация через Supabase Auth (P0.1 аудита безопасности,
// 2026-08-28) — раньше здесь была клиентская заглушка, сверяющая пароль
// в браузере против таблицы, читаемой anon-ключом целиком. Теперь вход —
// supabase.auth.signInWithPassword, а границу данных держит RLS в самой
// базе (access_profiles/остальные таблицы доступны anon-ключу только в том
// объёме, что нужен публичным страницам вне этого гейта — /plan/:token,
// лендинги объектов и т.п., см. scripts/audit-rls.mjs). Сессия хранится
// самим supabase-js (свой localStorage-ключ, не наш) — переживает
// перезагрузку страницы сама, без ручной работы с localStorage здесь.
//
// UX — выбор имени (LOGIN_ACCOUNTS) + один пароль, без видимого поля email:
// сам email — внутренний логин для Supabase Auth, не реальный ящик, никто
// его не читает и туда ничего не приходит.
const LEGACY_LOCALSTORAGE_KEYS = ['redevelopment-unlocked', 'redevelopment-access-profile-id'];

// signInWithPassword без ответа (DPI режет соединение, а не рвёт его) иначе
// висит на «Входим...» бесконечно — обрываем и показываем «нет связи».
const SIGN_IN_TIMEOUT_MS = 20000;
const ACCOUNT_CHECK_TIMEOUT_MS = 6000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'AbortError' })), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Мы на экране входа — значит, рабочей сессии нет. Остатки старой
// (протухший refresh-токен от прошлых версий/вкладок) в localStorage только
// мешают: supabase-js пытается их обновить под той же блокировкой, что и
// вход. Чистим перед входом — это ровно то, что сделал бы выход.
function clearStaleLocalSession() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && /^sb-[a-z0-9]+-auth-token(-code-verifier)?$/.test(key)) localStorage.removeItem(key);
    }
  } catch {
    /* приватный режим — нечего чистить */
  }
}

// Supabase на неверный пароль и на несуществующий/неподтверждённый/без доступа
// аккаунт отвечает одинаково — уточняем у своего api/login-check.js (через наш
// домен). Не ответил — оставляем «Неверный пароль», как было.
async function checkAccount(email: string): Promise<AccountCheck | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ACCOUNT_CHECK_TIMEOUT_MS);
    const resp = await fetch('/api/login-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!resp.ok) return null;
    const json = (await resp.json()) as Partial<AccountCheck>;
    if (typeof json.exists !== 'boolean') return null;
    return {
      exists: json.exists,
      confirmed: Boolean(json.confirmed),
      banned: Boolean(json.banned),
      hasAccess: Boolean(json.hasAccess),
    };
  } catch {
    return null;
  }
}

export function PasswordGate({ children }: { children: ReactNode }) {
  const [checkingSession, setCheckingSession] = useState(true);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  const [account, setAccount] = useState<LoginAccount | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // До какого момента не дёргать Supabase после 429 (лимит попыток входа).
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  async function loadProfilesAndUnlock(userId: string) {
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      const profiles = await fetchAccessProfiles();
      if (!profiles.some((p) => p.userId === userId)) {
        // Вход прошёл, но строки access_profiles у аккаунта нет — пускать
        // в пустую панель без единого раздела бессмысленно.
        await supabase.auth.signOut();
        setLoginError(loginErrorMessage({ kind: 'no_access', code: 'no_profile' }));
        return;
      }
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

  function selectAccount(next: LoginAccount) {
    setAccount(next);
    setPassword('');
    setLoginError(null);
  }

  function backToAccounts() {
    setAccount(null);
    setPassword('');
    setLoginError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || !account) return;
    if (lockedUntil && lockedUntil > Date.now()) {
      setLoginError(loginErrorMessage({ kind: 'rate_limited' }, lockedUntil - Date.now()));
      return;
    }
    setSubmitting(true);
    setLoginError(null);
    clearStaleLocalSession();
    let info: LoginErrorInfo | null = null;
    let userId: string | null = null;
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: account.email, password }),
        SIGN_IN_TIMEOUT_MS,
      );
      if (error || !data.user) info = classifyLoginError(error ?? { code: 'no_user_returned' });
      else userId = data.user.id;
    } catch (err) {
      info = classifyLoginError(err);
    }
    if (info) {
      if (info.kind === 'wrong_password') info = refineWithAccountCheck(info, await checkAccount(account.email));
      if (info.kind === 'rate_limited') setLockedUntil(Date.now() + RATE_LIMIT_WAIT_MS);
      if (info.kind !== 'wrong_password') console.warn('[login]', info.kind, info.code);
      setLoginError(loginErrorMessage(info));
      setSubmitting(false);
      return;
    }
    if (userId) await loadProfilesAndUnlock(userId);
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
      <div className={cn('flex w-full max-w-xs flex-col gap-4 p-6', glassCardClass)} style={glassCardShadow}>
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
          <span className="text-xs text-ink-faint">Внутренняя панель — доступ только для сотрудников</span>
        </div>

        {!account ? (
          <div className="flex flex-col gap-2">
            {LOGIN_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => selectAccount(a)}
                className="rounded-control border border-border bg-surface-muted px-4 py-3 text-center text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
              >
                {a.displayName}
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <button
              type="button"
              onClick={backToAccounts}
              className="flex items-center gap-1.5 self-start text-sm font-medium text-ink-muted hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              {account.displayName}
            </button>
            {/* Скрытый логин для менеджера паролей (2026-10-21): без него браузер
                хранит ОДИН пароль на весь redevelopment.pro и подставляет его
                любому выбранному сотруднику — старый или чужой пароль молча
                уходит в Supabase и даёт «Неверный пароль», хотя на другом
                адресе (превью) тот же человек входит, вводя пароль руками. */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={account.email}
              readOnly
              hidden
            />
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              label="Пароль"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setLoginError(null);
              }}
              state={loginError ? 'error' : 'default'}
              helperText={loginError ?? undefined}
              autoFocus
              required
            />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Входим...' : 'Войти'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
