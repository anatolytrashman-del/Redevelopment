import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

// Это не настоящая авторизация — фронтенд статический, без бэкенда, а
// Supabase-запросы уже работают с открытым anon-ключом без какого-либо
// токена. Это просто клиентская заглушка, которая отсекает случайных
// посетителей корня сайта: любой, кто откроет DevTools, может обойти
// проверку или прочитать пароль прямо в собранном JS. Публичная страница
// планировки (/plan/:token) находится вне этого гейта и его не требует.
const PASSWORD = '0000';
const STORAGE_KEY = 'redevelopment-unlocked';

export function PasswordGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  if (unlocked) return <>{children}</>;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password === PASSWORD) {
      localStorage.setItem(STORAGE_KEY, '1');
      setUnlocked(true);
    } else {
      setError(true);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-bg px-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-xs flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-card"
      >
        <span className="text-center text-lg font-extrabold tracking-wide text-ink">
          <span className="font-black text-primary">RED</span>EVELOPMENT
        </span>
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
