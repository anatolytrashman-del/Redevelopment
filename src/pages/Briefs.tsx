import { useEffect, useState } from 'react';
import { Plus, Loader2, Copy, Check, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BriefFormModal } from '../components/briefs/BriefFormModal';
import { BRIEF_TITLE, type Brief } from '../data/briefs';
import type { RealtyObject } from '../data/objects';
import type { Contractor } from '../data/contractors';
import { fetchBriefs, deleteBrief } from '../lib/briefsApi';
import { fetchObjects } from '../lib/objectsApi';
import { fetchContractors } from '../lib/contractorsApi';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

export function Briefs() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [objects, setObjects] = useState<RealtyObject[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingBrief, setEditingBrief] = useState<Brief | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchBriefs(), fetchObjects(), fetchContractors()])
      .then(([b, o, c]) => {
        setBriefs(b);
        setObjects(o);
        setContractors(c);
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить техзадания')))
      .finally(() => setLoading(false));
  }, []);

  function objectLabel(objectId: string): string {
    const o = objects.find((x) => x.id === objectId);
    if (!o) return 'Объект удалён';
    return o.name ? `${o.name} — ${o.address}` : o.address;
  }

  function publicUrl(brief: Brief): string {
    return `${window.location.origin}/tz/${brief.shareToken}`;
  }

  async function handleCopy(brief: Brief) {
    try {
      await navigator.clipboard.writeText(publicUrl(brief));
      setCopiedId(brief.id);
      setTimeout(() => setCopiedId((id) => (id === brief.id ? null : id)), 1500);
    } catch {
      // намеренно молча — ссылку видно текстом и так, просто не скопируется
    }
  }

  function openAddModal() {
    setEditingBrief(null);
    setOpen(true);
  }

  function openEditModal(b: Brief) {
    setEditingBrief(b);
    setOpen(true);
  }

  function handleSaved(saved: Brief) {
    setBriefs((prev) => (prev.some((b) => b.id === saved.id) ? prev.map((b) => (b.id === saved.id ? saved : b)) : [saved, ...prev]));
  }

  async function handleDelete(b: Brief) {
    if (deletingId) return;
    if (!window.confirm(`Удалить техзадание для «${objectLabel(b.objectId)}»?`)) return;
    setDeletingId(b.id);
    setActionError(null);
    try {
      await deleteBrief(b.id);
      setBriefs((prev) => prev.filter((x) => x.id !== b.id));
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось удалить техзадание'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Техзадания"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
            Добавить техзадание
          </Button>
        }
      />

      {actionError && <p className="text-sm text-danger">{actionError}</p>}

      <div className="flex flex-col gap-3">
        {briefs.map((b) => (
          <div
            key={b.id}
            className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between', glassCardClass)}
            style={glassCardShadow}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-semibold text-ink">{BRIEF_TITLE}</span>
              {/* Объект остаётся строкой ниже — иначе при нескольких
                  техзаданиях строки списка стали бы неразличимы. */}
              <span className="truncate text-sm text-ink-muted">{objectLabel(b.objectId)}</span>
              <span className="break-all text-xs text-ink-faint">{publicUrl(b)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                icon={copiedId === b.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                onClick={() => handleCopy(b)}
              >
                {copiedId === b.id ? 'Скопировано' : 'Скопировать ссылку'}
              </Button>
              <Button type="button" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => openEditModal(b)}>
                Редактировать
              </Button>
              <button
                type="button"
                onClick={() => handleDelete(b)}
                disabled={deletingId === b.id}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                aria-label="Удалить техзадание"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем техзадания...
          </Card>
        )}
        {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
        {!loading && !loadError && briefs.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Техзаданий пока нет</Card>
        )}
      </div>

      <BriefFormModal
        open={open}
        brief={editingBrief}
        objects={objects}
        contractors={contractors}
        onClose={() => setOpen(false)}
        onSaved={handleSaved}
      />
    </>
  );
}
