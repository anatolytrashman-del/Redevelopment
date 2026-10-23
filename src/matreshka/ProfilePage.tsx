import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { matreshkaApi } from './api';

export function ProfilePage({ me, onLogout, onLogoutAll, onChanged }: { me: any; onLogout: () => void; onLogoutAll: () => void; onChanged?: () => void }) {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const p = me?.profile || {};
  const name = [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ');
  const pos = p.position || me?.contexts?.current?.position || '';

  async function changePass(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!cur || !nw || nw.length < 10) {
      setMsg('Новый пароль минимум 10 символов');
      return;
    }
    setLoading(true);
    try {
      await matreshkaApi.changePassword(cur, nw);
      setMsg('Пароль изменён');
      setCur(''); setNw('');
      onChanged?.();
    } catch (e: any) {
      setMsg(e.message || 'Ошибка смены пароля');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <div className="font-semibold mb-2">Профиль</div>
        <div>ФИО: {name || '—'}</div>
        <div>Должность: {pos || '—'}</div>
      </Card>

      <Card>
        <div className="font-semibold mb-3">Смена пароля</div>
        <form onSubmit={changePass} className="space-y-3">
          <Input label="Текущий пароль" type="password" value={cur} onChange={(e) => setCur(e.target.value)} required />
          <Input label="Новый пароль (мин. 10)" type="password" value={nw} onChange={(e) => setNw(e.target.value)} required />
          <Button type="submit" disabled={loading}>Сменить пароль</Button>
          {msg && <div className="text-sm text-ink-muted">{msg}</div>}
        </form>
      </Card>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onLogout}>Выйти</Button>
        <Button variant="ghost" onClick={onLogoutAll}>Выйти на всех устройствах</Button>
      </div>
    </div>
  );
}
