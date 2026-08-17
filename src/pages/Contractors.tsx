import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AddableSelect } from '../components/ui/AddableSelect';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import { SearchInput } from '../components/ui/SearchInput';
import { ContactValue } from '../components/ui/ContactValue';
import { contractorSpecialties, contractorContactMethods, type Contractor } from '../data/contractors';
import { fetchContractors, insertContractor, updateContractor, deleteContractor } from '../lib/contractorsApi';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const emptyForm = {
  name: '',
  specialty: '',
  contact: '',
  contactMethod: '',
  notes: '',
  isCoreTeam: false,
};

function contractorToForm(c: Contractor) {
  return {
    name: c.name,
    specialty: c.specialty,
    contact: c.contact,
    contactMethod: c.contactMethod,
    notes: c.notes,
    isCoreTeam: c.isCoreTeam,
  };
}

// Один вид карточки и для "Команды", и для общего списка — разница между ними
// не в вёрстке, а только в том, из какой группы контактов её взяли.
function ContractorCard({
  contractor,
  onEdit,
  onDelete,
  deleting,
}: {
  contractor: Contractor;
  onEdit: (c: Contractor) => void;
  onDelete: (c: Contractor) => void;
  deleting: boolean;
}) {
  return (
    <div
      onClick={() => onEdit(contractor)}
      className={cn(
        'flex w-full min-w-[240px] max-w-sm flex-1 cursor-pointer flex-col gap-2 p-4 transition-colors hover:border-primary/40',
        glassCardClass,
      )}
      style={glassCardShadow}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink">{contractor.name}</div>
          <div className="truncate text-xs text-ink-muted">{contractor.specialty || '—'}</div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(contractor);
          }}
          disabled={deleting}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
          aria-label="Удалить подрядчика"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {contractor.contact && (
        <div className="truncate text-sm" onClick={(e) => e.stopPropagation()}>
          <ContactValue contact={contractor.contact} contactMethod={contractor.contactMethod} />
        </div>
      )}
      {contractor.notes && <div className="truncate text-xs text-ink-faint">{contractor.notes}</div>}
    </div>
  );
}

export function Contractors() {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchContractors()
      .then(setContractors)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить подрядчиков')))
      .finally(() => setLoading(false));
  }, []);

  const knownSpecialties = useMemo(() => {
    const set = new Set<string>(contractorSpecialties);
    contractors.forEach((c) => c.specialty && set.add(c.specialty));
    return [...set];
  }, [contractors]);

  const knownContactMethods = useMemo(() => {
    const set = new Set<string>(contractorContactMethods);
    contractors.forEach((c) => c.contactMethod && set.add(c.contactMethod));
    return [...set];
  }, [contractors]);

  const coreTeam = useMemo(() => contractors.filter((c) => c.isCoreTeam), [contractors]);

  // Общий список — без команды (она уже показана отдельным блоком выше),
  // отфильтрован поиском по имени/специальности и сгруппирован по
  // специальности, чтобы список из многих подрядчиков было легче просматривать.
  const generalGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rest = contractors.filter((c) => !c.isCoreTeam);
    const filtered = q
      ? rest.filter((c) => c.name.toLowerCase().includes(q) || c.specialty.toLowerCase().includes(q))
      : rest;
    const sorted = [...filtered].sort(
      (a, b) => a.specialty.localeCompare(b.specialty, 'ru') || a.name.localeCompare(b.name, 'ru'),
    );
    const groups: { specialty: string; items: Contractor[] }[] = [];
    for (const c of sorted) {
      const specialty = c.specialty || 'Без специальности';
      const last = groups[groups.length - 1];
      if (last && last.specialty === specialty) last.items.push(c);
      else groups.push({ specialty, items: [c] });
    }
    return groups;
  }, [contractors, search]);

  const canSubmit = form.name && form.specialty && form.contact;

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setSubmitError(null);
    setOpen(true);
  }

  function openEditModal(c: Contractor) {
    setEditingId(c.id);
    setForm(contractorToForm(c));
    setSubmitError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      name: form.name,
      specialty: form.specialty,
      contact: form.contact,
      contactMethod: form.contactMethod,
      notes: form.notes,
      isCoreTeam: form.isCoreTeam,
    };
    try {
      if (editingId) {
        const updated = await updateContractor(editingId, payload);
        setContractors((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      } else {
        const created = await insertContractor(payload);
        setContractors((prev) => [...prev, created]);
      }
      setForm(emptyForm);
      setEditingId(null);
      setOpen(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить подрядчика'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(c: Contractor) {
    if (deletingId) return;
    if (!window.confirm(`Удалить подрядчика «${c.name}»?`)) return;
    setDeletingId(c.id);
    setActionError(null);
    try {
      await deleteContractor(c.id);
      setContractors((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось удалить подрядчика'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Подрядчики"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
            Добавить подрядчика
          </Button>
        }
      />

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем подрядчиков...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && (
        <div className="flex flex-col gap-8">
          {coreTeam.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="text-lg font-bold text-ink">Команда</div>
              <div className="flex flex-wrap gap-4">
                {coreTeam.map((c) => (
                  <ContractorCard
                    key={c.id}
                    contractor={c}
                    onEdit={openEditModal}
                    onDelete={handleDelete}
                    deleting={deletingId === c.id}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-lg font-bold text-ink">Все подрядчики</div>
              <SearchInput
                placeholder="Имя или специальность..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-64"
              />
            </div>

            {generalGroups.length === 0 ? (
              <Card className="py-10 text-center text-sm text-ink-muted">
                {search ? 'Ничего не найдено' : 'Подрядчиков пока нет'}
              </Card>
            ) : (
              <div className="flex flex-col gap-5">
                {generalGroups.map((group) => (
                  <div key={group.specialty} className="flex flex-col gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                      {group.specialty}
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {group.items.map((c) => (
                        <ContractorCard
                          key={c.id}
                          contractor={c}
                          onEdit={openEditModal}
                          onDelete={handleDelete}
                          deleting={deletingId === c.id}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {actionError && <p className="text-sm text-danger">{actionError}</p>}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Редактировать подрядчика' : 'Новый подрядчик'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Имя"
            placeholder="Имя или название компании"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />

          <AddableSelect
            label="Специальность"
            placeholder="Не выбрано"
            options={knownSpecialties}
            value={form.specialty}
            onChange={(v) => setForm((f) => ({ ...f, specialty: v }))}
            addLabel="+ Добавить специальность"
            newPlaceholder="Название специальности"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Контакт"
              placeholder="@username, номер телефона..."
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              required
            />
            <AddableSelect
              label="Способ связи"
              placeholder="Не выбрано"
              options={knownContactMethods}
              value={form.contactMethod}
              onChange={(v) => setForm((f) => ({ ...f, contactMethod: v }))}
              addLabel="+ Добавить способ"
              newPlaceholder="Название способа связи"
            />
          </div>
          <p className="-mt-2 text-xs text-ink-faint">
            Для Telegram укажи способ связи "Telegram" — тогда юзернейм (с @ или без) сам превратится в ссылку,
            открывающую диалог.
          </p>

          <Textarea
            label="Заметки"
            placeholder="Плюсы, минусы, цены, с какими объектами работал..."
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />

          <ToggleGroup
            label="Постоянная команда"
            options={['Да', 'Нет']}
            value={form.isCoreTeam ? 'Да' : 'Нет'}
            onChange={(v) => setForm((f) => ({ ...f, isCoreTeam: v === 'Да' }))}
          />

          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
