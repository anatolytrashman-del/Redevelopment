import { useEffect, useState } from 'react';
import { osnovaSupabase } from './supabaseClient';
import { LoginScreen } from './LoginScreen';
import { ProfilePage } from './ProfilePage';
import { osnovaApi } from './api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';

type Tab = 'requests' | 'suppliers' | 'staff' | 'profile';

export default function ClientAdminApp() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('requests');
  const [clientName, setClientName] = useState('Клиент');

  // requests
  const [requests, setRequests] = useState<any[]>([]);
  const [reqFilter, setReqFilter] = useState('');
  const [showCreateReq, setShowCreateReq] = useState(false);
  const [newReq, setNewReq] = useState({ title: '', description: '', status: 'new' });
  const [reqBusy, setReqBusy] = useState(false);

  // suppliers
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supSearch, setSupSearch] = useState('');
  const [selectedSup, setSelectedSup] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [newPrice, setNewPrice] = useState({ item: '', price: '', note: '' });
  const [showAddSup, setShowAddSup] = useState(false);
  const [addSupForm, setAddSupForm] = useState({ name: '', inn: '', city: '', note: '' });
  const [supBusy, setSupBusy] = useState(false);

  // staff
  const [staff, setStaff] = useState<any[]>([]);

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
      const data = await osnovaApi.clientMe();
      setMe(data);
      if (data.client?.name) setClientName(data.client.name);
      setAuthed(true);
      // load initial
      void loadRequests();
      void loadSuppliers();
      void loadStaff();
    } catch (e: any) {
      const status = e?.status ?? 0;
      const code = e?.code || String(e?.message || '');
      if (status === 403) {
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

  async function loadRequests(status?: string) {
    try {
      const r = await osnovaApi.requestsList(status);
      setRequests(r.requests || []);
    } catch {}
  }

  async function createRequest() {
    if (!newReq.title.trim()) return;
    setReqBusy(true);
    try {
      await osnovaApi.requestsCreate(newReq);
      setShowCreateReq(false);
      setNewReq({ title: '', description: '', status: 'new' });
      await loadRequests(reqFilter || undefined);
    } catch (e: any) { alert(e.message || 'Ошибка'); } finally { setReqBusy(false); }
  }

  async function changeReqStatus(req: any, st: string) {
    setReqBusy(true);
    try {
      await osnovaApi.requestsUpdateStatus(req.id, st);
      await loadRequests(reqFilter || undefined);
    } catch {} finally { setReqBusy(false); }
  }

  async function loadSuppliers(search?: string) {
    try {
      const r = await osnovaApi.suppliersList(search);
      setSuppliers(r.suppliers || []);
    } catch {}
  }

  async function addSupplier() {
    if (!addSupForm.name.trim()) return;
    setSupBusy(true);
    try {
      await osnovaApi.suppliersAdd(addSupForm);
      setShowAddSup(false);
      setAddSupForm({ name: '', inn: '', city: '', note: '' });
      await loadSuppliers(supSearch || undefined);
    } catch (e: any) { alert(e.message || 'Ошибка'); } finally { setSupBusy(false); }
  }

  async function openSupplierCard(sup: any) {
    setSelectedSup(sup);
    setNotes([]); setPrices([]);
    try {
      const [n, p] = await Promise.all([
        osnovaApi.supplierNotesList(sup.ref),
        osnovaApi.supplierPricesList(sup.ref),
      ]);
      setNotes(n.notes || []);
      setPrices(p.prices || []);
    } catch {}
  }

  async function addNote() {
    if (!selectedSup || !newNote.trim()) return;
    setSupBusy(true);
    try {
      await osnovaApi.supplierNotesAdd({ supplier_ref: selectedSup.ref, body: newNote.trim() });
      setNewNote('');
      const n = await osnovaApi.supplierNotesList(selectedSup.ref);
      setNotes(n.notes || []);
    } catch {} finally { setSupBusy(false); }
  }

  async function addPrice() {
    if (!selectedSup || !newPrice.item.trim()) return;
    setSupBusy(true);
    try {
      await osnovaApi.supplierPricesAdd({ supplier_ref: selectedSup.ref, item: newPrice.item.trim(), price: newPrice.price ? Number(newPrice.price) : null, note: newPrice.note || null });
      setNewPrice({ item: '', price: '', note: '' });
      const p = await osnovaApi.supplierPricesList(selectedSup.ref);
      setPrices(p.prices || []);
    } catch {} finally { setSupBusy(false); }
  }

  async function loadStaff() {
    try {
      const r = await osnovaApi.clientMembers();
      setStaff(r.members || []);
    } catch {}
  }

  const role = me?.role || 'client_staff';
  const isAdmin = role === 'client_admin';

  if (loading) {
    return <div className="min-h-svh flex items-center justify-center">Загрузка…</div>;
  }

  if (!authed) {
    if (me?._denied) {
      return (
        <div className="min-h-svh flex items-center justify-center p-6 text-center">
          <div>
            <div className="text-lg mb-2">Нет доступа</div>
            <Button onClick={() => logout('local')}>Выйти</Button>
          </div>
        </div>
      );
    }
    return <LoginScreen onAuthed={handleAuthed} clientName={clientName} />;
  }

  const displayName = [me?.profile?.last_name, me?.profile?.first_name].filter(Boolean).join(' ') || 'Пользователь';
  const pos = me?.profile?.position || me?.contexts?.current?.position || '';

  const statusOptions = ['new','in_progress','waiting','done','cancelled'];

  return (
    <div className="min-h-svh bg-surface text-ink text-sm">
      <header className="border-b border-border bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-3 h-12 flex items-center justify-between">
          <div className="font-semibold truncate">Основа — {clientName}</div>
          <div className="flex items-center gap-2 text-xs">
            <span className="hidden sm:inline">{displayName}{pos ? `, ${pos}` : ''}</span>
            <Button variant="ghost" onClick={() => logout('local')} className="text-xs px-3 py-1">Выйти</Button>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-2 border-t border-border flex gap-0.5 text-xs overflow-x-auto">
          {[
            { k: 'requests', l: 'Заявки' },
            { k: 'suppliers', l: 'Поставщики' },
            { k: 'staff', l: 'Сотрудники' },
            { k: 'profile', l: 'Профиль' },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k as Tab)}
              className={`px-3 py-2 -mb-px border-b-2 whitespace-nowrap ${tab === t.k ? 'border-primary text-ink' : 'border-transparent text-ink-muted'}`}
            >
              {t.l}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto p-3 pb-16">
        {tab === 'requests' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                options={['', ...statusOptions]}
                value={reqFilter}
                onChange={(v) => { setReqFilter(v); loadRequests(v || undefined); }}
                placeholder="Все статусы"
              />
              <Button onClick={() => setShowCreateReq(true)} className="text-xs px-3 py-1.5">+ Заявка</Button>
            </div>

            <div className="space-y-2">
              {requests.length === 0 && <div className="text-ink-muted">Нет заявок</div>}
              {requests.map((r) => (
                <Card key={r.id} className="p-3">
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="font-medium">#{r.number} {r.title}</div>
                      <div className="text-xs text-ink-muted">{r.description || ''}</div>
                      <div className="text-[10px] mt-1">до {r.due_date || '—'} • {r.status}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Select
                        options={statusOptions}
                        value={r.status}
                        onChange={(st) => changeReqStatus(r, st)}
                        pill
                      />
                      <div className="text-[10px] text-ink-faint">{r.priority || ''}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <Modal open={showCreateReq} onClose={() => setShowCreateReq(false)} title="Новая заявка">
              <div className="space-y-3">
                <Input label="Название" value={newReq.title} onChange={(e) => setNewReq({ ...newReq, title: e.target.value })} />
                <Input label="Описание" value={newReq.description} onChange={(e) => setNewReq({ ...newReq, description: e.target.value })} />
                <div>
                  <div className="text-sm text-ink-muted mb-1">Статус</div>
                  <Select options={statusOptions} value={newReq.status} onChange={(v) => setNewReq({ ...newReq, status: v })} />
                </div>
                <Button onClick={createRequest} disabled={reqBusy || !newReq.title.trim()}>Создать</Button>
              </div>
            </Modal>
          </div>
        )}

        {tab === 'suppliers' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Поиск поставщика" value={supSearch} onChange={(e) => setSupSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadSuppliers(supSearch); }} className="flex-1" />
              <Button onClick={() => loadSuppliers(supSearch)} className="px-3">Найти</Button>
              <Button variant="secondary" onClick={() => setShowAddSup(true)} className="px-3">+ Добавить</Button>
            </div>

            <div className="space-y-1">
              {suppliers.map((s) => (
                <button key={s.ref} onClick={() => openSupplierCard(s)} className="w-full text-left">
                  <Card className="p-2 flex justify-between items-center">
                    <div>
                      <div>{s.name}</div>
                      <div className="text-xs text-ink-muted">{s.inn || ''} {s.city || ''}</div>
                    </div>
                    <Badge>{s.source}</Badge>
                  </Card>
                </button>
              ))}
              {suppliers.length === 0 && <div className="text-ink-muted">Нет поставщиков</div>}
            </div>

            {selectedSup && (
              <Card className="p-3 border-primary/40">
                <div className="flex justify-between">
                  <div className="font-medium">{selectedSup.name}</div>
                  <Button variant="ghost" onClick={() => setSelectedSup(null)}>×</Button>
                </div>
                <div className="text-xs text-ink-muted mb-2">{selectedSup.ref}</div>

                <div className="mt-2">
                  <div className="font-medium text-xs mb-1">Пометки клиента</div>
                  <div className="space-y-1 mb-2">
                    {notes.map((n, i) => <div key={i} className="text-xs bg-surface p-1 rounded">{n.body}</div>)}
                    {notes.length === 0 && <div className="text-ink-faint text-xs">—</div>}
                  </div>
                  <div className="flex gap-1">
                    <Input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Новая пометка" className="flex-1" />
                    <Button onClick={addNote} disabled={supBusy || !newNote.trim()}>+</Button>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="font-medium text-xs mb-1">Цены клиента</div>
                  <div className="space-y-1 mb-2 text-xs">
                    {prices.map((pr, i) => (
                      <div key={i}>{pr.item}: {pr.price} {pr.currency} {pr.note ? `(${pr.note})` : ''}</div>
                    ))}
                    {prices.length === 0 && <div className="text-ink-faint">—</div>}
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    <Input placeholder="Позиция" value={newPrice.item} onChange={(e) => setNewPrice({ ...newPrice, item: e.target.value })} />
                    <div className="flex gap-1">
                      <Input placeholder="Цена" value={newPrice.price} onChange={(e) => setNewPrice({ ...newPrice, price: e.target.value })} className="w-24" />
                      <Input placeholder="Примечание" value={newPrice.note} onChange={(e) => setNewPrice({ ...newPrice, note: e.target.value })} className="flex-1" />
                      <Button onClick={addPrice} disabled={supBusy || !newPrice.item.trim()}>+</Button>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            <Modal open={showAddSup} onClose={() => setShowAddSup(false)} title="Добавить поставщика (на модерацию)">
              <div className="space-y-2">
                <Input label="Название" value={addSupForm.name} onChange={(e) => setAddSupForm({ ...addSupForm, name: e.target.value })} required />
                <Input label="ИНН" value={addSupForm.inn} onChange={(e) => setAddSupForm({ ...addSupForm, inn: e.target.value })} />
                <Input label="Город" value={addSupForm.city} onChange={(e) => setAddSupForm({ ...addSupForm, city: e.target.value })} />
                <Input label="Заметка" value={addSupForm.note} onChange={(e) => setAddSupForm({ ...addSupForm, note: e.target.value })} />
                <Button onClick={addSupplier} disabled={supBusy || !addSupForm.name.trim()}>Отправить на модерацию</Button>
              </div>
            </Modal>
          </div>
        )}

        {tab === 'staff' && (
          <div className="space-y-2">
            {staff.length === 0 && <div className="text-ink-muted">Нет сотрудников</div>}
            {staff.map((m, idx) => (
              <Card key={idx} className="p-2">
                <div>{m.name || '—'} {m.position ? `• ${m.position}` : ''}</div>
                {isAdmin && m.role && <div className="text-xs text-ink-muted">{m.role} • {m.status}</div>}
              </Card>
            ))}
            {!isAdmin && <div className="text-xs text-ink-muted">Роли видны только client_admin</div>}
          </div>
        )}

        {tab === 'profile' && (
          <ProfilePage me={me} onLogout={() => logout('local')} onLogoutAll={() => logout('global')} onChanged={() => loadMe()} />
        )}
      </main>
    </div>
  );
}
