import { useEffect, useState } from 'react';
import { osnovaSupabase } from './supabaseClient';
import { LoginScreen } from './LoginScreen';
import { ProfilePage } from './ProfilePage';
import { osnovaApi } from './api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export default function ClientAdminApp() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<'profile' | 'other'>('other');
  const [clientName, setClientName] = useState('Клиент');

  useEffect(() => {
    osnovaSupabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        loadMe();
      } else {
        setLoading(false);
      }
    });
    const { data: sub } = osnovaSupabase.auth.onAuthStateChange((_e, s) => {
      if (s) loadMe(); else { setAuthed(false); setMe(null); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadMe() {
    setLoading(true);
    try {
      const data = await osnovaApi.me();
      setMe(data);
      if (data.contexts?.current?.client_name) setClientName(data.contexts.current.client_name);
      setAuthed(true);
    } catch (e: any) {
      const status = e?.status ?? 0;
      const code = e?.code || String(e?.message || '');
      if (status === 403 && /no_client_membership|not_platform_owner/i.test(code)) {
        setMe({ _denied: true, code });
        setAuthed(false);
      } else if (status === 401) {
        await osnovaSupabase.auth.signOut();
        setAuthed(false);
        setMe(null);
      } else {
        await osnovaSupabase.auth.signOut();
        setAuthed(false);
        setMe(null);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleAuthed() {
    loadMe();
  }

  async function logout(scope: 'local' | 'global') {
    if (scope === 'global') {
      try { await osnovaApi.logoutAll(); } catch {}
    }
    await osnovaSupabase.auth.signOut({ scope: scope === 'global' ? 'global' : undefined });
    setAuthed(false);
    setMe(null);
  }

  if (loading) {
    return <div className="min-h-svh flex items-center justify-center">Загрузка…</div>;
  }

  if (!authed) {
    if (me?._denied) {
      return (
        <div className="min-h-svh flex items-center justify-center p-6 text-center">
          <div>
            <div className="text-lg mb-2">Доступ не выдан</div>
            <Button onClick={() => logout('local')}>Выйти</Button>
          </div>
        </div>
      );
    }
    return <LoginScreen onAuthed={handleAuthed} clientName={clientName} />;
  }

  const displayName = [me?.profile?.last_name, me?.profile?.first_name].filter(Boolean).join(' ') || 'Пользователь';
  const pos = me?.profile?.position || me?.contexts?.current?.position || '';

  return (
    <div className="min-h-svh bg-surface text-ink">
      <header className="border-b border-border bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="font-semibold">Основа — {clientName}</div>
          <div className="flex items-center gap-3 text-sm">
            <span>{displayName}{pos ? `, ${pos}` : ''}</span>
            <Button variant="ghost" onClick={() => logout('local')}>Выйти</Button>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-4 border-t border-border flex gap-1 text-sm">
          {['Заявки', 'Поставщики', 'Сотрудники', 'Профиль'].map((label, i) => {
            const key = i === 3 ? 'profile' : 'other';
            return (
              <button
                key={label}
                onClick={() => setTab(key as any)}
                className={`px-4 py-2 -mb-px border-b-2 ${tab === key ? 'border-primary text-ink' : 'border-transparent text-ink-muted'}`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto p-4">
        {tab === 'profile' ? (
          <ProfilePage me={me} onLogout={() => logout('local')} onLogoutAll={() => logout('global')} onChanged={() => loadMe()} />
        ) : (
          <Card>
            <div className="text-ink-muted">Раздел в разработке</div>
          </Card>
        )}
      </main>
    </div>
  );
}
