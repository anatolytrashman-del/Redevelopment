import { useEffect, useState } from 'react';
import { osnovaSupabase } from './supabaseClient';
import { LoginScreen } from './LoginScreen';
import { osnovaApi } from './api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';

export default function PlatformAdminApp() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<'clients' | 'users' | 'journal' | 'moderation'>('clients');

  // switcher
  const [clientSlug, setClientSlug] = useState<string | null>(null);
  const [clientNameForView, setClientNameForView] = useState('');

  // data
  const [clients, setClients] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [journal, setJournal] = useState<any[]>([]);
  const [modPending, setModPending] = useState<any[]>([]);
  const [positions] = useState<string[]>(['Закупщик', 'Администратор']);

  // forms state
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [newClient, setNewClient] = useState({ slug: '', name: '' });

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', first_name: '', last_name: '', client_id: '', role: 'client_staff', position_title: 'Закупщик' });
  const [tempPass, setTempPass] = useState<string | null>(null);

  const [filterClientId, setFilterClientId] = useState('');

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
      if (!data?.contexts?.platform_owner) {
        setMe({ _denied: true });
        setAuthed(false);
      } else {
        setAuthed(true);
        void loadAll();
      }
    } catch (e: any) {
      const status = e?.status ?? 0;
      if (status === 403) {
        setMe({ _denied: true });
        setAuthed(false);
      } else {
        await osnovaSupabase.auth.signOut();
        setAuthed(false);
        setMe(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadAll() {
    try {
      const [cl, us, jl, mp] = await Promise.all([
        osnovaApi.platformClients(),
        osnovaApi.platformUsers(),
        osnovaApi.platformSecurityLog({ limit: 50 }),
        osnovaApi.platformModerationList(),
      ]);
      setClients(cl.clients || []);
      setUsers(us.users || []);
      setJournal(jl.log || []);
      setModPending(mp.pending || []);
    } catch {}
  }

  function handleAuthed() { loadMe(); }

  async function logout() {
    try { await osnovaApi.logoutAll(); } catch {}
    await osnovaSupabase.auth.signOut();
    setAuthed(false);
    setMe(null);
    setClientSlug(null);
  }

  async function loadClients() {
    const c = await osnovaApi.platformClients();
    setClients(c.clients || []);
  }

  async function createClient() {
    if (!newClient.slug || !newClient.name) return;
    try {
      await osnovaApi.platformClientsCreate(newClient);
      setShowCreateClient(false);
      setNewClient({ slug: '', name: '' });
      await loadClients();
    } catch (e: any) { alert(e.message || 'Ошибка'); }
  }

  async function setClientStatus(c: any, st: string) {
    try {
      await osnovaApi.platformClientsUpdate(c.id, st);
      await loadClients();
    } catch {}
  }

  async function loadUsers() {
    const u = await osnovaApi.platformUsers();
    setUsers(u.users || []);
  }

  async function createUser() {
    if (!newUser.email) return;
    try {
      const res = await osnovaApi.platformUsersCreate({
        ...newUser,
        client_id: newUser.client_id || (clients[0]?.id || null),
      });
      setTempPass(res.temp_password || null);
      setShowCreateUser(false);
      setNewUser({ email: '', first_name: '', last_name: '', client_id: '', role: 'client_staff', position_title: 'Закупщик' });
      await loadUsers();
    } catch (e: any) { alert(e.message || 'Ошибка создания'); }
  }

  async function resetPw(u: any) {
    try {
      const pr = await osnovaApi.platformResetPassword(u.id || u.user_id);
      setTempPass(pr.temp_password || null);
    } catch { alert('Не удалось'); }
  }

  async function toggleUser(u: any, enable: boolean) {
    try {
      await osnovaApi.platformUsersUpdate({ user_id: u.id || u.user_id, status: enable ? 'active' : 'disabled', client_id: u.client_id });
      await loadUsers();
    } catch {}
  }

  async function loadJournal(cid?: string) {
    const j = await osnovaApi.platformSecurityLog({ client_id: cid || filterClientId || undefined, limit: 100 });
    setJournal(j.log || []);
  }

  async function approve(id: string) {
    await osnovaApi.platformModerationApprove(id);
    const m = await osnovaApi.platformModerationList();
    setModPending(m.pending || []);
  }
  async function reject(id: string) {
    await osnovaApi.platformModerationReject(id);
    const m = await osnovaApi.platformModerationList();
    setModPending(m.pending || []);
  }

  // switcher: platform owner picks client -> render client staff view (using clientSlug)
  async function switchToClient(slug: string, name: string) {
    setClientSlug(slug);
    setClientNameForView(name);
    setTab('clients'); // will render client mode below
  }
  function backToPlatform() {
    setClientSlug(null);
    setClientNameForView('');
  }



  if (loading) return <div className="min-h-svh flex items-center justify-center">Загрузка…</div>;

  if (!authed) {
    if (me?._denied) {
      return (
        <div className="min-h-svh flex items-center justify-center p-6 text-center">
          <div>
            <div className="text-lg mb-2">Нет доступа</div>
            <Button onClick={logout}>Выйти</Button>
          </div>
        </div>
      );
    }
    return <LoginScreen onAuthed={handleAuthed} />;
  }

  // if switched to client view: show client UI in staff mode (pass clientSlug to apis)
  if (clientSlug) {
    return (
      <div className="min-h-svh bg-surface">
        <header className="border-b h-12 flex items-center px-3 text-sm">
          <div className="font-semibold mr-3">Платформа</div>
          <div className="flex items-center gap-1 text-xs">
            <button onClick={backToPlatform} className="underline">Платформа</button>
            <span>/</span>
            <span className="font-medium">{clientNameForView}</span>
            <span className="text-ink-faint">(сотрудник)</span>
          </div>
          <div className="ml-auto"><Button variant="ghost" onClick={logout} className="text-xs">Выйти</Button></div>
        </header>
        {/* reuse minimal client tabs without full re-auth */}
        <ClientViewAsStaff clientSlug={clientSlug} onBack={backToPlatform} />
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-surface text-sm">
      <header className="border-b h-12 flex items-center px-3">
        <div className="font-semibold">Платформа — админка</div>
        <div className="ml-4 flex items-center gap-1 text-xs">
          <span>Платформа</span>
          <Select
            options={['', ...clients.map((c: any) => c.slug)]}
            value={''}
            onChange={(sl) => {
              const c = clients.find((x: any) => x.slug === sl);
              if (c) switchToClient(c.slug, c.name);
            }}
            placeholder="Переключить на клиента"
          />
        </div>
        <div className="ml-auto"><Button variant="ghost" onClick={logout} className="text-xs">Выйти</Button></div>
      </header>

      <nav className="flex gap-3 p-3 text-sm border-b overflow-x-auto">
        {['Клиенты', 'Пользователи', 'Журнал', 'Модерация'].map((t) => {
          const k = (t === 'Клиенты' ? 'clients' : t === 'Пользователи' ? 'users' : t === 'Журнал' ? 'journal' : 'moderation') as any;
          return <button key={t} onClick={() => setTab(k)} className={tab === k ? 'underline font-medium' : ''}>{t}</button>;
        })}
      </nav>

      <main className="p-3 max-w-5xl mx-auto space-y-4">
        {tab === 'clients' && (
          <div>
            <Button onClick={() => setShowCreateClient(true)} className="mb-2 text-xs">+ Клиент</Button>
            <div className="space-y-2">
              {clients.map((c) => (
                <Card key={c.id} className="p-2 flex flex-wrap items-center gap-2">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-ink-muted">{c.slug} • {c.status}</div>
                  <div className="ml-auto flex gap-1">
                    <Button variant="secondary" onClick={() => setClientStatus(c, 'active')} className="text-xs px-2 py-0.5">Активен</Button>
                    <Button variant="secondary" onClick={() => setClientStatus(c, 'suspended')} className="text-xs px-2 py-0.5">Приостановлен</Button>
                    <Button variant="ghost" onClick={() => switchToClient(c.slug, c.name)} className="text-xs">Войти как</Button>
                  </div>
                </Card>
              ))}
            </div>
            <Modal open={showCreateClient} onClose={() => setShowCreateClient(false)} title="Новый клиент">
              <Input label="Slug" value={newClient.slug} onChange={(e) => setNewClient({ ...newClient, slug: e.target.value })} />
              <Input label="Название" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
              <Button onClick={createClient}>Создать</Button>
            </Modal>
          </div>
        )}

        {tab === 'users' && (
          <div className="space-y-2">
            <Button onClick={() => setShowCreateUser(true)} className="text-xs">+ Пользователь</Button>
            {tempPass && (
              <Card className="p-2 bg-yellow-50 border-yellow-200 text-xs">Временный пароль (показан один раз): <span className="font-mono">{tempPass}</span> <Button variant="ghost" onClick={() => setTempPass(null)}>скрыть</Button></Card>
            )}
            {users.map((u, i) => (
              <Card key={i} className="p-2 text-xs">
                <div>{u.last_name} {u.first_name} • {u.email?.replace(/(.).+@/, '$1***@')}</div>
                <div className="text-ink-muted">{(u.client_members || []).map((m: any) => m.clients?.name).join(', ')} {u.positions?.title}</div>
                <div className="flex gap-1 mt-1">
                  <Button variant="secondary" className="text-xs px-2 py-0" onClick={() => resetPw(u)}>Сбросить пароль</Button>
                  <Button variant="ghost" className="text-xs px-2 py-0" onClick={() => toggleUser(u, u.status !== 'active')}>{u.status === 'active' ? 'Отключить' : 'Включить'}</Button>
                </div>
              </Card>
            ))}
            <Modal open={showCreateUser} onClose={() => setShowCreateUser(false)} title="Создать пользователя">
              <div className="space-y-2">
                <Input label="Email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
                <Input label="Фамилия" value={newUser.last_name} onChange={e => setNewUser({ ...newUser, last_name: e.target.value })} />
                <Input label="Имя" value={newUser.first_name} onChange={e => setNewUser({ ...newUser, first_name: e.target.value })} />
                <Select label="Клиент" options={clients.map((c: any) => c.id)} value={newUser.client_id} onChange={v => setNewUser({ ...newUser, client_id: v })} placeholder="Выберите client id" />
                <Select label="Роль" options={['client_admin', 'client_staff']} value={newUser.role} onChange={v => setNewUser({ ...newUser, role: v })} />
                <Select label="Должность" options={positions} value={newUser.position_title} onChange={v => setNewUser({ ...newUser, position_title: v })} />
                <Button onClick={createUser}>Создать (пароль в ответе)</Button>
              </div>
            </Modal>
          </div>
        )}

        {tab === 'journal' && (
          <div>
            <div className="mb-2 flex gap-2">
              <Select options={['', ...clients.map((c: any) => c.id)]} value={filterClientId} onChange={(v) => { setFilterClientId(v); loadJournal(v); }} placeholder="Фильтр по клиенту" />
              <Button onClick={() => loadJournal()} className="text-xs">Обновить</Button>
            </div>
            <div className="space-y-1 text-xs">
              {journal.map((j, i) => (
                <div key={i} className="border-b pb-1">{new Date(j.created_at).toLocaleString()} • {j.event_type} {j.client_id ? 'c:' + j.client_id.slice(0,8) : ''}</div>
              ))}
            </div>
          </div>
        )}

        {tab === 'moderation' && (
          <div className="space-y-2">
            {modPending.length === 0 && <div className="text-ink-muted">Нет на модерации</div>}
            {modPending.map((p) => (
              <Card key={p.id} className="p-2">
                <div>{p.name} {p.inn} ({p.moderation_status})</div>
                <div className="flex gap-2 mt-1">
                  <Button onClick={() => approve(p.id)} className="text-xs">Одобрить</Button>
                  <Button variant="secondary" onClick={() => reject(p.id)} className="text-xs">Отклонить</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// Lightweight client view for platform owner switch (staff mode, no owner badge)
function ClientViewAsStaff({ clientSlug, onBack }: { clientSlug: string; onBack: () => void }) {
  const [tab, setTab] = useState<'requests' | 'suppliers' | 'staff' | 'profile'>('requests');
  const [requests, setRequests] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedSup, setSelectedSup] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [supSearch, setSupSearch] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newPrice, setNewPrice] = useState({ item: '', price: '', note: '' });
  const [addSupForm, setAddSupForm] = useState({ name: '', inn: '', city: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadReq();
    void loadSup();
    void loadSt();
  }, [clientSlug]);

  async function loadReq(st?: string) {
    try { const r = await osnovaApi.requestsList(st, clientSlug); setRequests(r.requests || []); } catch {}
  }
  async function loadSup(s?: string) {
    try { const r = await osnovaApi.suppliersList(s, clientSlug); setSuppliers(r.suppliers || []); } catch {}
  }
  async function loadSt() {
    try { const r = await osnovaApi.clientMembers(clientSlug); setStaff(r.members || []); } catch {}
  }

  async function createReqQuick() {
    const title = prompt('Название заявки?');
    if (!title) return;
    await osnovaApi.requestsCreate({ title }, clientSlug);
    await loadReq();
  }
  async function setStatus(r: any, st: string) {
    await osnovaApi.requestsUpdateStatus(r.id, st, clientSlug);
    await loadReq();
  }

  async function openCard(s: any) {
    setSelectedSup(s);
    const [n, p] = await Promise.all([osnovaApi.supplierNotesList(s.ref, clientSlug), osnovaApi.supplierPricesList(s.ref, clientSlug)]);
    setNotes(n.notes || []); setPrices(p.prices || []);
  }
  async function addN() {
    if (!newNote.trim() || !selectedSup) return;
    setBusy(true);
    await osnovaApi.supplierNotesAdd({ supplier_ref: selectedSup.ref, body: newNote }, clientSlug);
    setNewNote('');
    const n = await osnovaApi.supplierNotesList(selectedSup.ref, clientSlug);
    setNotes(n.notes || []);
    setBusy(false);
  }
  async function addP() {
    if (!newPrice.item || !selectedSup) return;
    setBusy(true);
    await osnovaApi.supplierPricesAdd({ supplier_ref: selectedSup.ref, item: newPrice.item, price: newPrice.price ? Number(newPrice.price) : null }, clientSlug);
    setNewPrice({ item: '', price: '', note: '' });
    const p = await osnovaApi.supplierPricesList(selectedSup.ref, clientSlug);
    setPrices(p.prices || []);
    setBusy(false);
  }
  async function addS() {
    if (!addSupForm.name) return;
    setBusy(true);
    await osnovaApi.suppliersAdd(addSupForm, clientSlug);
    setShowAdd(false); setAddSupForm({ name: '', inn: '', city: '' });
    await loadSup(supSearch);
    setBusy(false);
  }

  return (
    <div className="p-3 max-w-5xl mx-auto">
      <div className="text-xs mb-2 text-ink-muted">Режим сотрудника клиента (без прав владельца)</div>
      <div className="flex gap-1 border-b mb-3 text-xs">
        {(['requests', 'suppliers', 'staff', 'profile'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 ${tab === t ? 'border-b-2 border-primary' : ''}`}>
            {t === 'requests' ? 'Заявки' : t === 'suppliers' ? 'Поставщики' : t === 'staff' ? 'Сотрудники' : 'Профиль'}
          </button>
        ))}
        <button onClick={onBack} className="ml-auto text-primary">← На платформу</button>
      </div>

      {tab === 'requests' && (
        <div>
          <Button onClick={createReqQuick} className="mb-2 text-xs">+ Заявка</Button>
          {requests.map((r) => (
            <Card key={r.id} className="p-2 mb-1">
              #{r.number} {r.title}
              <Select options={['new','in_progress','waiting','done','cancelled']} value={r.status} onChange={(st) => setStatus(r, st)} pill />
            </Card>
          ))}
        </div>
      )}
      {tab === 'suppliers' && (
        <div>
          <div className="flex gap-2 mb-2">
            <Input value={supSearch} onChange={e => setSupSearch(e.target.value)} placeholder="поиск" onKeyDown={e => e.key === 'Enter' && loadSup(supSearch)} />
            <Button onClick={() => loadSup(supSearch)} className="text-xs">Найти</Button>
            <Button variant="secondary" onClick={() => setShowAdd(true)} className="text-xs">+Добавить</Button>
          </div>
          {suppliers.map(s => <div key={s.ref} onClick={() => openCard(s)} className="cursor-pointer"><Card className="p-1 mb-1">{s.name} <Badge>{s.source}</Badge></Card></div>)}
          {selectedSup && (
            <Card className="mt-2 p-2">
              <div>{selectedSup.name}</div>
              <div className="mt-2 text-xs">Пометки: {notes.map((n, i) => <div key={i}>{n.body}</div>)}</div>
              <Input value={newNote} onChange={e => setNewNote(e.target.value)} /><Button onClick={addN} disabled={busy}>add note</Button>
              <div className="mt-2 text-xs">Цены: {prices.map((p, i) => <div key={i}>{p.item} {p.price}</div>)}</div>
              <Input value={newPrice.item} onChange={e => setNewPrice({ ...newPrice, item: e.target.value })} placeholder="item" />
              <Button onClick={addP} disabled={busy}>add price</Button>
            </Card>
          )}
          <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Добавить">
            <Input value={addSupForm.name} onChange={e => setAddSupForm({ ...addSupForm, name: e.target.value })} />
            <Button onClick={addS} disabled={busy}>Отправить</Button>
          </Modal>
        </div>
      )}
      {tab === 'staff' && staff.map((m, i) => <Card key={i} className="p-1 mb-1">{m.name} {m.position}</Card>)}
      {tab === 'profile' && <div className="text-xs">Смена пароля и выход — используйте профиль в обычном клиенте.</div>}
    </div>
  );
}
