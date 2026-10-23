import { useEffect, useState } from 'react';
import { matreshkaSupabase } from './supabaseClient';
import { LoginScreen } from './LoginScreen';
import { ProfilePage } from './ProfilePage';
import { matreshkaApi } from './api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { getVisibleSections } from './positions';

type Tab = 'requests' | 'suppliers' | 'staff' | 'settings' | 'profile';

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
  const [newReq, setNewReq] = useState({ title: '', description: '', status: 'new', supply_kind: '' });
  const [reqBusy, setReqBusy] = useState(false);
  const [reqFiles, setReqFiles] = useState<any>({});
  const [fileUploading, setFileUploading] = useState(false);

  // suppliers
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supSearch, setSupSearch] = useState('');
  const [supOffset, setSupOffset] = useState(0);
  const supLimit = 50;
  const [supTotal, setSupTotal] = useState(0);
  const [legacyAvailable, setLegacyAvailable] = useState(true);
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

  // approvals / block4
  const [approvalRules, setApprovalRules] = useState<any[]>([]);
  const [reqEvents, setReqEvents] = useState<any>({});
  const [bitrixForm, setBitrixForm] = useState<{id: string; ref: string; note: string} | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [newRule, setNewRule] = useState({ supply_kind: '', approver_user_id: '', approver_position_id: '', priority: 100 });

  useEffect(() => {
    matreshkaSupabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        loadMe();
      } else {
        setLoading(false);
      }
    });
    const { data: sub } = matreshkaSupabase.auth.onAuthStateChange((_e, s) => {
      if (s) loadMe(); else { setAuthed(false); setMe(null); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authed && me) {
      const v = getVisibleSections(me?.profile?.position || me?.contexts?.current?.position || '');
      if (tab !== 'settings' && tab !== 'profile' && !v.includes(tab as any)) {
        const first = (v[0] || 'requests') as Tab;
        if (first !== tab) setTab(first);
      }
    }
  }, [authed, me, tab]);

  async function loadMe() {
    setLoading(true);
    try {
      const data = await matreshkaApi.clientMe();
      setMe(data);
      if (data.client?.name) setClientName(data.client.name);
      setAuthed(true);
      // load initial
      void loadRequests();
      void loadSuppliers();
      void loadStaff();
      if (data.role === 'client_admin' || data.is_owner_view) void loadApprovalRules();
    } catch (e: any) {
      const status = e?.status ?? 0;
      const code = e?.code || String(e?.message || '');
      if (status === 403) {
        setMe({ _denied: true, code });
        setAuthed(false);
      } else if (status === 401) {
        await matreshkaSupabase.auth.signOut();
        setAuthed(false);
        setMe(null);
      } else {
        await matreshkaSupabase.auth.signOut();
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
      try { await matreshkaApi.logoutAll(); } catch {}
    }
    await matreshkaSupabase.auth.signOut({ scope: scope === 'global' ? 'global' : undefined });
    setAuthed(false);
    setMe(null);
  }

  async function loadRequests(status?: string) {
    try {
      const r = await matreshkaApi.requestsList(status);
      const reqs = r.requests || [];
      setRequests(reqs);
      // preload files for first few, events (history) for all
      reqs.slice(0, 3).forEach((rr: any) => { void loadFiles(rr.id); });
      reqs.forEach((rr: any) => { void loadEvents(rr.id); });
    } catch {}
  }

  async function createRequest() {
    if (!newReq.title.trim()) return;
    setReqBusy(true);
    try {
      await matreshkaApi.requestsCreate(newReq);
      setShowCreateReq(false);
      setNewReq({ title: '', description: '', status: 'new', supply_kind: '' });
      await loadRequests(reqFilter || undefined);
    } catch (e: any) { alert(e.message || 'Ошибка'); } finally { setReqBusy(false); }
  }

  async function changeReqStatus(req: any, st: string) {
    setReqBusy(true);
    try {
      await matreshkaApi.requestsUpdateStatus(req.id, st);
      await loadRequests(reqFilter || undefined);
    } catch {} finally { setReqBusy(false); }
  }

  async function doApprove(r: any) {
    setReqBusy(true);
    try {
      await matreshkaApi.requestsApprove(r.id);
      await loadRequests(reqFilter || undefined);
      await loadEvents(r.id);
    } catch (e: any) { alert(e.message || 'Нет прав'); } finally { setReqBusy(false); }
  }
  async function doReject(r: any) {
    setReqBusy(true);
    try {
      await matreshkaApi.requestsReject(r.id);
      await loadRequests(reqFilter || undefined);
      await loadEvents(r.id);
    } catch (e: any) { alert(e.message || 'Нет прав'); } finally { setReqBusy(false); }
  }
  async function doMarkBitrix(rid: string, ref: string, note: string) {
    if (!rid || (!ref.trim() && !note.trim())) return;
    setReqBusy(true);
    try {
      await matreshkaApi.requestsMarkBitrix(rid, ref.trim() || undefined, note.trim() || undefined);
      setBitrixForm(null);
      await loadRequests(reqFilter || undefined);
      await loadEvents(rid);
    } catch (e: any) { alert(e.message || 'Ошибка'); } finally { setReqBusy(false); }
  }

  async function loadFiles(rid: string) {
    try {
      const l = await matreshkaApi.filesList(rid);
      setReqFiles((p: any) => ({ ...p, [rid]: l.files || [] }));
    } catch {}
  }

  async function attachFile(r: any, file: File) {
    if (!file) return;
    setFileUploading(true);
    try {
      const up = await matreshkaApi.filesUploadUrl({ request_id: r.id, filename: file.name });
      const putRes = await fetch(up.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) throw new Error('upload failed');
      await loadFiles(r.id);
    } catch { /* silent for minimal */ } finally { setFileUploading(false); }
  }

  async function openFileSigned(path: string) {
    try {
      const s = await matreshkaApi.filesSign({ path });
      if (s.signedUrl) window.open(s.signedUrl, '_blank');
    } catch {}
  }

  async function loadSuppliers(search?: string, newOffset?: number) {
    const off = typeof newOffset === 'number' ? newOffset : supOffset;
    try {
      const r = await matreshkaApi.suppliersList({ search: search || undefined, limit: supLimit, offset: off });
      setSuppliers(r.suppliers || []);
      setSupTotal(r.total || 0);
      setLegacyAvailable(r.legacy_available !== false);
    } catch {}
  }

  async function addSupplier() {
    if (!addSupForm.name.trim()) return;
    setSupBusy(true);
    try {
      await matreshkaApi.suppliersAdd(addSupForm);
      setShowAddSup(false);
      setAddSupForm({ name: '', inn: '', city: '', note: '' });
      setSupOffset(0);
      await loadSuppliers(supSearch || undefined, 0);
    } catch (e: any) { alert(e.message || 'Ошибка'); } finally { setSupBusy(false); }
  }

  async function openSupplierCard(sup: any) {
    setSelectedSup(sup);
    setNotes([]); setPrices([]);
    try {
      const [n, p] = await Promise.all([
        matreshkaApi.supplierNotesList(sup.ref),
        matreshkaApi.supplierPricesList(sup.ref),
      ]);
      setNotes(n.notes || []);
      setPrices(p.prices || []);
    } catch {}
  }

  async function addNote() {
    if (!selectedSup || !newNote.trim()) return;
    setSupBusy(true);
    try {
      await matreshkaApi.supplierNotesAdd({ supplier_ref: selectedSup.ref, body: newNote.trim() });
      setNewNote('');
      const n = await matreshkaApi.supplierNotesList(selectedSup.ref);
      setNotes(n.notes || []);
    } catch {} finally { setSupBusy(false); }
  }

  async function addPrice() {
    if (!selectedSup || !newPrice.item.trim()) return;
    setSupBusy(true);
    try {
      await matreshkaApi.supplierPricesAdd({ supplier_ref: selectedSup.ref, item: newPrice.item.trim(), price: newPrice.price ? Number(newPrice.price) : null, note: newPrice.note || null });
      setNewPrice({ item: '', price: '', note: '' });
      const p = await matreshkaApi.supplierPricesList(selectedSup.ref);
      setPrices(p.prices || []);
    } catch {} finally { setSupBusy(false); }
  }

  async function loadStaff() {
    try {
      const r = await matreshkaApi.clientMembers();
      setStaff(r.members || []);
    } catch {}
  }

  async function loadApprovalRules() {
    try {
      const r = await matreshkaApi.approvalRulesList();
      setApprovalRules(r.rules || []);
    } catch {}
  }

  async function loadEvents(rid: string) {
    try {
      const e = await matreshkaApi.requestsEventsList(rid);
      setReqEvents((p: any) => ({ ...p, [rid]: e.events || [] }));
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
  const visibleSections = getVisibleSections(pos);

  const statusOptions = ['new','in_progress','waiting','done','cancelled'];

  return (
    <div className="min-h-svh bg-surface text-ink text-sm">
      <header className="border-b border-border bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-3 h-12 flex items-center justify-between">
          <div className="font-semibold truncate">Матрешка</div>
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
            ...(isAdmin ? [{ k: 'settings', l: 'Настройки' }] : []),
            { k: 'profile', l: 'Профиль' },
          ].filter((t) => {
            if (t.k === 'profile') return true;
            if (t.k === 'settings') return isAdmin;
            return visibleSections.includes(t.k as any);
          }).map((t) => (
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
                       <div className="mt-1 text-[10px] flex items-center gap-2">
                         <span>Вид: {r.supply_kind || '—'}</span>
                         <Badge tone={
                           r.approval_status === 'approved' ? 'success' :
                           r.approval_status === 'pending' ? 'warning' :
                           r.approval_status === 'rejected' ? 'danger' : 'neutral'
                         }>{r.approval_status || 'not_required'}</Badge>
                       </div>
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
                    {r.approval_status === 'pending' && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Button onClick={() => doApprove(r)} disabled={reqBusy} className="text-xs px-2 py-0.5">Согласовать</Button>
                        <Button onClick={() => doReject(r)} disabled={reqBusy} variant="secondary" className="text-xs px-2 py-0.5">Отклонить</Button>
                        <Button onClick={() => setBitrixForm({ id: r.id, ref: '', note: '' })} disabled={reqBusy} variant="ghost" className="text-xs px-2 py-0.5">Отметить: согласовано в Битрикс24</Button>
                      </div>
                    )}
                    <div className="mt-2 border-t pt-1 text-[10px] text-ink-muted">
                      Файлы:{' '}
                      {(reqFiles[r.id] || []).map((f: any, i: number) => (
                        <a key={i} href="#" onClick={(e) => { e.preventDefault(); openFileSigned(f.path); }} className="underline mr-1 text-primary">{f.name}</a>
                      ))}
                      {!(reqFiles[r.id] || []).length && <span className="text-ink-faint">—</span>}
                      <label className="ml-2 cursor-pointer text-primary">
                        +
                        <input
                          type="file"
                          className="hidden"
                          disabled={fileUploading}
                          onChange={(e) => {
                            const fl = e.target.files?.[0];
                            if (fl) attachFile(r, fl);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    <div className="mt-1 text-[9px] text-ink-faint">
                      История: {(reqEvents[r.id] || []).length ? '' : '—'}
                      {(reqEvents[r.id] || []).map((ev: any, ii: number) => (
                        <span key={ii} className="mr-2">{ev.created_at ? ev.created_at.slice(5,16).replace('T',' ') : ''} {ev.kind}{ev.payload?.method ? `(${ev.payload.method})` : ''}{ev.payload?.rejected ? '!' : ''}</span>
                      ))}
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
                <Input label="Вид поставки (для согласования)" value={newReq.supply_kind} onChange={(e) => setNewReq({ ...newReq, supply_kind: e.target.value })} placeholder="Фасад / Кровля / ..." />
                <Button onClick={createRequest} disabled={reqBusy || !newReq.title.trim()}>Создать</Button>
              </div>
            </Modal>
          </div>
        )}

        {tab === 'suppliers' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Поиск поставщика" value={supSearch} onChange={(e) => setSupSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setSupOffset(0); loadSuppliers(supSearch, 0); } }} className="flex-1" />
              <Button onClick={() => { setSupOffset(0); loadSuppliers(supSearch, 0); }} className="px-3">Найти</Button>
              <Button variant="secondary" onClick={() => setShowAddSup(true)} className="px-3">+ Добавить</Button>
            </div>
            {!legacyAvailable && <div className="text-xs text-amber-600">Каталог платформы временно недоступен</div>}

            <div className="space-y-1">
              {suppliers.map((s) => (
                <button key={s.ref} onClick={() => openSupplierCard(s)} className="w-full text-left">
                  <Card className="p-2 flex justify-between items-center">
                    <div>
                      <div>{s.name || 'Поставщик из каталога'}</div>
                      <div className="text-xs text-ink-muted">
                        {[s.inn, s.city, s.phone, s.email, s.website_url].filter(Boolean).join(' · ')}
                      </div>
                      <div className="text-[10px] text-ink-faint">
                        {s.notes && s.notes.length ? `пометок: ${s.notes.length} · ${String(s.notes[0]?.body || '').slice(0, 50)}` : ''}
                        {s.prices && s.prices.length ? `  цены: ${s.prices[0]?.item || ''} ${s.prices[0]?.price || ''} ${s.prices[0]?.currency || ''}` : ''}
                      </div>
                    </div>
                    <Badge>{s.source === 'catalog' ? 'каталог' : 'добавлен'}</Badge>
                  </Card>
                </button>
              ))}
              {suppliers.length === 0 && <div className="text-ink-muted">Нет поставщиков</div>}
            </div>
            <div className="flex gap-2 text-xs">
              <span>Всего: {supTotal}</span>
              <Button variant="ghost" disabled={supOffset === 0} onClick={() => { const no = Math.max(0, supOffset - supLimit); setSupOffset(no); loadSuppliers(supSearch || undefined, no); }}>←</Button>
              <Button variant="ghost" disabled={supOffset + supLimit >= supTotal} onClick={() => { const no = supOffset + supLimit; setSupOffset(no); loadSuppliers(supSearch || undefined, no); }}>→</Button>
            </div>

            {selectedSup && (
              <Card className="p-3 border-primary/40">
                <div className="flex justify-between">
                  <div className="font-medium">{selectedSup.name || 'Поставщик из каталога'}</div>
                  <Button variant="ghost" onClick={() => setSelectedSup(null)}>×</Button>
                </div>
                <div className="text-xs text-ink-muted mb-2">
                  {selectedSup.ref}
                  {selectedSup.inn ? ' · ' + selectedSup.inn : ''}
                  {selectedSup.city ? ' · ' + selectedSup.city : ''}
                  {selectedSup.phone ? ' · ' + selectedSup.phone : ''}
                  {selectedSup.email ? ' · ' + selectedSup.email : ''}
                  {selectedSup.website_url ? ' · ' + selectedSup.website_url : ''}
                </div>

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

        {tab === 'settings' && isAdmin && (
          <div className="space-y-3">
            <Card className="p-3">
              <div className="font-medium mb-1">Настройки</div>
              <div className="text-xs text-ink-muted">
                approval_required: только platform owner (platform.clients.update). Здесь read-only заметка. При true + правило по supply_kind — заявки создаются со статусом pending.
              </div>
            </Card>

            <Card className="p-3">
              <div className="font-medium text-xs mb-1">Матрица согласований (supply_kind → user/position)</div>
              {approvalRules.length === 0 && <div className="text-xs text-ink-muted">Правил нет</div>}
              {approvalRules.map((rule: any, i: number) => (
                <div key={i} className="flex flex-wrap items-center gap-1 text-[10px] border p-1 mb-1 rounded">
                  <span className="font-mono">{rule.supply_kind}</span>
                  <span>→</span>
                  {rule.approver_user_id && <span>user:{String(rule.approver_user_id).slice(0,8)}</span>}
                  {rule.approver_position_id && <span>pos:{String(rule.approver_position_id).slice(0,8)}</span>}
                  <span className="text-ink-faint">p:{rule.priority}</span>
                  <Button variant="ghost" className="text-xs px-1 py-0" onClick={async () => {
                    if (!confirm('Удалить правило?')) return;
                    try {
                      await matreshkaApi.approvalRulesDelete(rule.id);
                      await loadApprovalRules();
                    } catch (e: any) { alert(e.message || 'err'); }
                  }}>×</Button>
                </div>
              ))}

              <div className="mt-2 space-y-1 text-xs">
                <Input placeholder="supply_kind (напр. Фасад)" value={newRule.supply_kind} onChange={(e) => setNewRule({ ...newRule, supply_kind: e.target.value })} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  <Input placeholder="approver_user_id (uuid)" value={newRule.approver_user_id} onChange={(e) => setNewRule({ ...newRule, approver_user_id: e.target.value })} className="text-[10px]" />
                  <Input placeholder="approver_position_id (uuid)" value={newRule.approver_position_id} onChange={(e) => setNewRule({ ...newRule, approver_position_id: e.target.value })} className="text-[10px]" />
                </div>
                <div className="flex gap-1 items-center">
                  <Input placeholder="prio" type="number" value={newRule.priority} onChange={(e) => setNewRule({ ...newRule, priority: Number(e.target.value) || 100 })} className="w-16" />
                  <Button onClick={async () => {
                    const sk = newRule.supply_kind.trim();
                    const au = newRule.approver_user_id.trim();
                    const ap = newRule.approver_position_id.trim();
                    if (!sk || (!au && !ap)) { alert('supply_kind и approver обязательны'); return; }
                    setSettingsBusy(true);
                    try {
                      await matreshkaApi.approvalRulesUpsert({ supply_kind: sk, approver_user_id: au || null, approver_position_id: ap || null, priority: newRule.priority });
                      setNewRule({ supply_kind: '', approver_user_id: '', approver_position_id: '', priority: 100 });
                      await loadApprovalRules();
                    } catch (e: any) { alert(e.message || 'upsert err'); } finally { setSettingsBusy(false); }
                  }} disabled={settingsBusy} className="text-xs">Добавить правило</Button>
                </div>
              </div>
              <div className="text-[10px] text-ink-faint mt-1">UUID позиций — из таблицы positions. Для client_admin правила применяются при create если approval_required.</div>
            </Card>
          </div>
        )}

        {tab === 'profile' && (
          <ProfilePage me={me} onLogout={() => logout('local')} onLogoutAll={() => logout('global')} onChanged={() => loadMe()} />
        )}

        <Modal open={!!bitrixForm} onClose={() => setBitrixForm(null)} title="Отметить: согласовано в Битрикс24">
          <div className="space-y-2 text-xs">
            <Input label="Ref / ссылка в Битрикс" value={bitrixForm?.ref || ''} onChange={(e) => setBitrixForm(b => b ? { ...b, ref: e.target.value } : null)} />
            <Input label="Примечание" value={bitrixForm?.note || ''} onChange={(e) => setBitrixForm(b => b ? { ...b, note: e.target.value } : null)} />
            <Button disabled={reqBusy || !bitrixForm || (!bitrixForm.ref.trim() && !bitrixForm.note.trim())} onClick={() => {
              if (bitrixForm) doMarkBitrix(bitrixForm.id, bitrixForm.ref, bitrixForm.note);
            }}>Отметить согласованным в Битрикс24</Button>
          </div>
        </Modal>
      </main>
    </div>
  );
}
