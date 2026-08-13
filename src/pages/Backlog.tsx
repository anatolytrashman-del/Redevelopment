import { useEffect, useState } from 'react';
import { Plus, Loader2, Lightbulb } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import type { BacklogIdea } from '../data/backlog';
import { fetchBacklogIdeas, insertBacklogIdea } from '../lib/backlogApi';
import { markBacklogViewed } from '../lib/backlogSeen';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

const emptyForm = { idea: '', benefit: '' };

export function Backlog() {
  const [ideas, setIdeas] = useState<BacklogIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchBacklogIdeas()
      .then(setIdeas)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить бэклог')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    markBacklogViewed();
  }, []);

  const canSubmit = form.idea.trim() && form.benefit.trim();

  function openAddModal() {
    setForm(emptyForm);
    setSubmitError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await insertBacklogIdea({ idea: form.idea.trim(), benefit: form.benefit.trim() });
      setIdeas((prev) => [created, ...prev]);
      setForm(emptyForm);
      setOpen(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить идею'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Предложить идею"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
            Добавить идею
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {ideas.map((item) => (
          <Card key={item.id} className="flex gap-4 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Lightbulb className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-ink">{item.idea}</div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{item.benefit}</p>
              <div className="mt-2 text-xs text-ink-faint">{formatDate(item.createdAt)}</div>
            </div>
          </Card>
        ))}

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем бэклог...
          </Card>
        )}
        {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
        {!loading && !loadError && ideas.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Идей пока нет — предложите первую</Card>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Новая идея">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Textarea
            label="Идея по улучшению"
            placeholder="Что предлагаете внедрить на платформу..."
            value={form.idea}
            onChange={(e) => setForm((f) => ({ ...f, idea: e.target.value }))}
            rows={3}
            required
          />
          <Textarea
            label="Чем это поможет"
            placeholder="Какую проблему решает или что улучшает..."
            value={form.benefit}
            onChange={(e) => setForm((f) => ({ ...f, benefit: e.target.value }))}
            rows={3}
            required
          />

          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? 'Сохраняем...' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
