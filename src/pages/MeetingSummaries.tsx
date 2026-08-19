import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2, Copy, Check, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import type { MeetingSummary } from '../data/meetingSummaries';
import { fetchMeetingSummaries, insertMeetingSummary, deleteMeetingSummary } from '../lib/meetingSummariesApi';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function MeetingSummaries() {
  const [summaries, setSummaries] = useState<MeetingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchMeetingSummaries()
      .then(setSummaries)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить саммери встреч')))
      .finally(() => setLoading(false));
  }, []);

  function publicUrl(s: MeetingSummary): string {
    return `${window.location.origin}/summary/${s.shareToken}`;
  }

  async function handleCopy(s: MeetingSummary) {
    try {
      await navigator.clipboard.writeText(publicUrl(s));
      setCopiedId(s.id);
      setTimeout(() => setCopiedId((id) => (id === s.id ? null : id)), 1500);
    } catch {
      // намеренно молча — ссылку видно текстом и так, просто не скопируется
    }
  }

  async function handleAdd() {
    if (creating) return;
    setCreating(true);
    setActionError(null);
    try {
      const created = await insertMeetingSummary({ title: 'Новое саммери', content: '' });
      setSummaries((prev) => [created, ...prev]);
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось создать саммери'));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(s: MeetingSummary) {
    if (deletingId) return;
    if (!window.confirm(`Удалить саммери «${s.title || 'без названия'}»?`)) return;
    setDeletingId(s.id);
    setActionError(null);
    try {
      await deleteMeetingSummary(s.id);
      setSummaries((prev) => prev.filter((x) => x.id !== s.id));
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось удалить саммери'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Саммери встреч"
        action={
          <Button icon={creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} onClick={handleAdd} disabled={creating}>
            Добавить саммери
          </Button>
        }
      />

      {actionError && <p className="text-sm text-danger">{actionError}</p>}

      <div className="flex flex-col gap-3">
        {summaries.map((s) => (
          <div
            key={s.id}
            className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between', glassCardClass)}
            style={glassCardShadow}
          >
            <Link to={`/admin/meeting-summaries/${s.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-semibold text-ink">{s.title || 'Без названия'}</span>
              <span className="text-sm text-ink-muted">{formatDate(s.createdAt)}</span>
              <span className="break-all text-xs text-ink-faint">{publicUrl(s)}</span>
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                icon={copiedId === s.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                onClick={() => handleCopy(s)}
              >
                {copiedId === s.id ? 'Скопировано' : 'Скопировать ссылку'}
              </Button>
              <button
                type="button"
                onClick={() => handleDelete(s)}
                disabled={deletingId === s.id}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                aria-label="Удалить саммери"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем саммери встреч...
          </Card>
        )}
        {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
        {!loading && !loadError && summaries.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Саммери пока нет</Card>
        )}
      </div>
    </>
  );
}
