import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Pencil, Trash2, ExternalLink, Handshake } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { AddableSelect } from '../components/ui/AddableSelect';
import { Modal } from '../components/ui/Modal';
import { ContactValue } from '../components/ui/ContactValue';
import { collaborationContactMethods, collaborationStatuses, type Collaboration } from '../data/collaborations';
import { badgeColor } from '../lib/badgeColor';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import {
  fetchCollaborations,
  insertCollaboration,
  updateCollaboration,
  deleteCollaboration,
} from '../lib/collaborationsApi';

function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const emptyForm = {
  partner: '',
  contactMethod: collaborationContactMethods[0] as string,
  contact: '',
  link: '',
  agreement: '',
  status: collaborationStatuses[0] as string,
};

function collaborationToForm(c: Collaboration) {
  return {
    partner: c.partner,
    contactMethod: c.contactMethod,
    contact: c.contact,
    link: c.link,
    agreement: c.agreement,
    status: c.status,
  };
}

function CollaborationCard({
  collaboration,
  onEdit,
  onDelete,
  deleting,
}: {
  collaboration: Collaboration;
  onEdit: (c: Collaboration) => void;
  onDelete: (c: Collaboration) => void;
  deleting: boolean;
}) {
  const colors = badgeColor(collaboration.status);
  return (
    <div
      onClick={() => onEdit(collaboration)}
      className={cn(
        'relative flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:border-primary/40',
        glassCardClass,
      )}
      style={glassCardShadow}
    >
      <div className="absolute right-2 top-2 flex gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(collaboration);
          }}
          aria-label="Редактировать"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-ink-muted hover:border-primary hover:text-primary"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(collaboration);
          }}
          disabled={deleting}
          aria-label="Удалить"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-start gap-3 pr-16">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-surface-muted text-ink-faint">
          <Handshake className="h-5 w-5" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-semibold text-ink">{collaboration.partner || 'Без названия'}</span>
          <Badge style={{ backgroundColor: colors.bg, color: colors.text }}>{collaboration.status}</Badge>
        </div>
      </div>

      {collaboration.contact && (
        <div className="truncate text-sm text-ink-muted">
          {collaboration.contactMethod && `${collaboration.contactMethod}: `}
          <ContactValue contact={collaboration.contact} contactMethod={collaboration.contactMethod} />
        </div>
      )}

      {collaboration.agreement && <p className="line-clamp-3 text-sm text-ink-muted">{collaboration.agreement}</p>}

      {collaboration.link && (
        <a
          href={collaboration.link}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-sm text-primary-hover hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{collaboration.link}</span>
        </a>
      )}
    </div>
  );
}

export function Collaborations() {
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Растущие списки способа связи и статуса — стартовый набор + всё, что уже
  // встречалось (в т.ч. добавленное через форму ранее), как у лидов/банков.
  const knownContactMethods = useMemo(() => {
    const set = new Set<string>(collaborationContactMethods);
    collaborations.forEach((c) => c.contactMethod && set.add(c.contactMethod));
    return [...set];
  }, [collaborations]);

  const knownStatuses = useMemo(() => {
    const set = new Set<string>(collaborationStatuses);
    collaborations.forEach((c) => set.add(c.status));
    return [...set];
  }, [collaborations]);

  useEffect(() => {
    fetchCollaborations()
      .then(setCollaborations)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить коллаборации')))
      .finally(() => setLoading(false));
  }, []);

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setSubmitError(null);
    setOpen(true);
  }

  function openEditModal(c: Collaboration) {
    setEditingId(c.id);
    setForm(collaborationToForm(c));
    setSubmitError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      partner: form.partner.trim(),
      contactMethod: form.contactMethod,
      contact: form.contact.trim(),
      link: form.link.trim(),
      agreement: form.agreement.trim(),
      status: form.status,
    };
    try {
      if (editingId) {
        const updated = await updateCollaboration(editingId, payload);
        setCollaborations((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      } else {
        const created = await insertCollaboration(payload);
        setCollaborations((prev) => [created, ...prev]);
      }
      setForm(emptyForm);
      setEditingId(null);
      setOpen(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить коллаборацию'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(c: Collaboration) {
    if (!window.confirm(`Удалить коллаборацию с «${c.partner || 'без названия'}»?`)) return;
    setDeletingId(c.id);
    setDeleteError(null);
    try {
      await deleteCollaboration(c.id);
      setCollaborations((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      setDeleteError(errorMessage(err, 'Не удалось удалить'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Коллаборации"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
            Добавить партнёра
          </Button>
        }
      />

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем коллаборации...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
      {!loading && !loadError && collaborations.length === 0 && (
        <Card className="py-10 text-center text-sm text-ink-muted">Пока нет ни одной коллаборации — добавь первую</Card>
      )}
      {!loading && !loadError && collaborations.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collaborations.map((c) => (
            <CollaborationCard
              key={c.id}
              collaboration={c}
              onEdit={openEditModal}
              onDelete={handleDelete}
              deleting={deletingId === c.id}
            />
          ))}
        </div>
      )}

      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Редактировать коллаборацию' : 'Новая коллаборация'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Партнёр"
            placeholder="Название компании или имя"
            value={form.partner}
            onChange={(e) => setForm((f) => ({ ...f, partner: e.target.value }))}
            required
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AddableSelect
              label="Способ связи"
              options={knownContactMethods}
              value={form.contactMethod}
              onChange={(v) => setForm((f) => ({ ...f, contactMethod: v }))}
              addLabel="+ Добавить способ связи"
              newPlaceholder="Название способа связи"
            />
            <Input
              label="Контакт"
              placeholder="Ник, адрес почты..."
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
            />
          </div>

          <Input
            label="Ссылка"
            placeholder="https://..."
            value={form.link}
            onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
          />

          <Textarea
            label="О чём договариваемся"
            placeholder="Условия, детали сотрудничества..."
            value={form.agreement}
            onChange={(e) => setForm((f) => ({ ...f, agreement: e.target.value }))}
          />

          <AddableSelect
            label="Статус"
            options={knownStatuses}
            value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status: v }))}
            addLabel="+ Добавить статус"
            newPlaceholder="Название статуса"
          />

          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
