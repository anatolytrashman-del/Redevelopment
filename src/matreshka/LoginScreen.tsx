import { useEffect, useState, type ReactNode } from 'react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { matreshkaApi } from './api';
import { matreshkaSupabase, matreshkaConfigMissing } from './supabaseClient';

interface Props {
  onAuthed: () => void;
  clientName?: string;
  /** Заголовок экрана входа: по умолчанию клиентская админка «Матрешка». */
  title?: string;
  /** Логотип над заголовком (lobsters.pro); у «Матрешки» не передаётся. */
  logo?: ReactNode;
}

export function LoginScreen({ onAuthed, clientName, title = 'Матрешка', logo }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBitrix, setShowBitrix] = useState(false);

  useEffect(() => {
    matreshkaApi.providers().then((p) => setShowBitrix(!!p.bitrix24)).catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { access_token, refresh_token } = await matreshkaApi.login(email.trim(), password);
      if (access_token) {
        await matreshkaSupabase.auth.setSession({ access_token, refresh_token: refresh_token || '' });
      }
      onAuthed();
    } catch {
      setError('Неверный email или пароль');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {logo && <div className="mb-3 flex justify-center">{logo}</div>}
          <div className="text-2xl font-semibold tracking-tight">{title}</div>
          {clientName && <div className="text-sm text-ink-muted mt-1">{clientName}</div>}
          <div className="text-sm text-ink-muted mt-1">Вход</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <Input
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && <div className="text-sm text-danger">{error}</div>}
          {matreshkaConfigMissing && matreshkaConfigMissing.length > 0 && (
            <div className="text-sm text-danger">Конфигурация входа не настроена: {matreshkaConfigMissing.join(', ')}</div>
          )}

          <Button type="submit" disabled={loading || !email || !password || (matreshkaConfigMissing && matreshkaConfigMissing.length > 0)} className="w-full">
            {loading ? 'Входим…' : 'Войти'}
          </Button>
        </form>

        {showBitrix && (
          <div className="mt-3">
            <Button variant="secondary" className="w-full" disabled>
              Войти через Битрикс24
            </Button>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-ink-faint">
          Пароль выдаёт владелец. Сессия сохраняется.
        </p>
      </div>
    </div>
  );
}
