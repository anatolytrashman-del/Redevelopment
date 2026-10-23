import { useEffect, useState } from 'react';
import { osnovaSupabase } from './supabaseClient';
import { LoginScreen } from './LoginScreen';
import { osnovaApi } from './api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export default function PlatformAdminApp() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState('clients');

  useEffect(() => {
    osnovaSupabase.auth.getSession().then(({ data }) => {
      if (data.session) loadMe();
      else setLoading(false);
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

  function handleAuthed() { loadMe(); }

  async function logout() {
    try { await osnovaApi.logoutAll(); } catch {}
    await osnovaSupabase.auth.signOut();
    setAuthed(false);
    setMe(null);
  }

  if (loading) return <div className="min-h-svh flex items-center justify-center">Загрузка…</div>;

  if (!authed) {
    if (me?._denied) {
      return (
        <div className="min-h-svh flex items-center justify-center p-6 text-center">
          <div>
            <div className="text-lg mb-2">Доступ не выдан</div>
            <Button onClick={logout}>Выйти</Button>
          </div>
        </div>
      );
    }
    return <LoginScreen onAuthed={handleAuthed} />;
  }

  return (
    <div className="min-h-svh bg-surface">
      <header className="border-b h-14 flex items-center px-4">
        <div className="font-semibold mr-auto">Платформа — админка</div>
        <Button variant="ghost" onClick={logout}>Выйти</Button>
      </header>
      <nav className="flex gap-2 p-4 text-sm border-b">
        {['Клиенты', 'Пользователи', 'Журнал'].map((t) => (
          <button key={t} onClick={() => setTab(t.toLowerCase())} className={tab === t.toLowerCase() ? 'underline' : ''}>{t}</button>
        ))}
      </nav>
      <main className="p-4 max-w-5xl mx-auto">
        <Card>
          <div className="text-ink-muted">Раздел «{tab}» в разработке</div>
        </Card>
      </main>
    </div>
  );
}
