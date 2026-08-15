import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';

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
