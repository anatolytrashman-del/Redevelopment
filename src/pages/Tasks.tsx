import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, CheckCircle2, Trash2, Flame } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { Modal } from '../components/ui/Modal';
import { taskAssignees, type Task, type TaskAssignee } from '../data/tasks';
import { badgeColor } from '../lib/badgeColor';
import { cn } from '../lib/cn';
import { fetchTasks, insertTask, updateTask, deleteTask } from '../lib/tasksApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDate(isoDate: string) {
  if (!isoDate) return '—';
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

const emptyForm = {
  title: '',
  description: '',
  date: '',
  assignees: [] as TaskAssignee[],
  isPriority: false,
};

function AssigneeBadges({ assignees }: { assignees: TaskAssignee[] }) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
      {assignees.map((a) => {
        const colors = badgeColor(a);
        return (
          <span
            key={a}
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: colors.bg, color: colors.text }}
          >
            {a}
          </span>
        );
      })}
    </div>
  );
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [resultDraft, setResultDraft] = useState('');
  const [savingResult, setSavingResult] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks()
      .then(setTasks)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить задачи')))
      .finally(() => setLoading(false));
  }, []);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.isDone), [tasks]);
  const archivedTasks = useMemo(
    () => [...tasks.filter((t) => t.isDone)].sort((a, b) => b.date.localeCompare(a.date)),
    [tasks],
  );

  const canSubmit = form.title.trim() && form.date && form.assignees.length > 0;

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
      const created = await insertTask({
        title: form.title.trim(),
        description: form.description.trim(),
        date: form.date,
        assignees: form.assignees,
        isPriority: form.isPriority,
        isDone: false,
        result: '',
      });
      setTasks((prev) => [...prev, created]);
      setForm(emptyForm);
      setOpen(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить задачу'));
    } finally {
      setSubmitting(false);
    }
  }

  function openCompleteModal(task: Task) {
    setCompletingTask(task);
    setResultDraft('');
    setResultError(null);
  }

  async function submitComplete() {
    if (!completingTask || !resultDraft.trim()) return;
    setSavingResult(true);
    setResultError(null);
    try {
      const { id, ...rest } = completingTask;
      const updated = await updateTask(id, { ...rest, isDone: true, result: resultDraft.trim() });
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      setCompletingTask(null);
    } catch (err) {
      setResultError(errorMessage(err, 'Не удалось сохранить результат'));
    } finally {
      setSavingResult(false);
    }
  }

  async function handleDelete(task: Task) {
    if (!window.confirm(`Удалить задачу «${task.title}»?`)) return;
    setDeletingId(task.id);
    setDeleteError(null);
    try {
      await deleteTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      setDeleteError(errorMessage(err, 'Не удалось удалить задачу'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Задачи"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
            Добавить задачу
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {activeTasks.map((task) => {
          return (
            <Card key={task.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {task.isPriority && (
                      <span title="Приоритет">
                        <Flame className="h-4 w-4 shrink-0 fill-warning text-warning" />
                      </span>
                    )}
                    <div className="font-bold text-ink">{task.title}</div>
                  </div>
                  {task.description && (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{task.description}</p>
                  )}
                </div>
                <AssigneeBadges assignees={task.assignees} />
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-ink-muted">{formatDate(task.date)}</span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={() => openCompleteModal(task)}
                  >
                    Пометить выполненной
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleDelete(task)}
                    disabled={deletingId === task.id}
                    aria-label="Удалить задачу"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          );
        })}

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем задачи...
          </Card>
        )}
        {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
        {!loading && !loadError && activeTasks.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Активных задач пока нет</Card>
        )}
        {deleteError && <p className="text-sm text-danger">{deleteError}</p>}
      </div>

      {!loading && archivedTasks.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="text-lg font-bold text-ink">Архив</div>
          {archivedTasks.map((task) => {
            return (
              <Card key={task.id} className="flex flex-col gap-3 p-5 opacity-80">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {task.isPriority && (
                      <span title="Приоритет">
                        <Flame className="h-4 w-4 shrink-0 fill-warning text-warning" />
                      </span>
                    )}
                      <div className="font-bold text-ink line-through decoration-ink-faint">{task.title}</div>
                    </div>
                    {task.description && (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{task.description}</p>
                    )}
                  </div>
                  <AssigneeBadges assignees={task.assignees} />
                </div>
                <div className="text-sm text-ink-muted">{formatDate(task.date)}</div>
                <div className="rounded-control bg-surface-muted px-4 py-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Результат</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{task.result}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(task)}
                  disabled={deletingId === task.id}
                  className="flex w-fit items-center gap-2 text-sm font-medium text-ink-muted hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Удалить
                </button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Новая задача">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Заголовок"
            placeholder="Например, Согласовать концепцию с собственником"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <Textarea
            label="Описание"
            placeholder="Свободное описание задачи..."
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Input
            label="Дата"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            required
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-muted">Ответственные</span>
            <div className="flex flex-wrap gap-2">
              {taskAssignees.map((a) => {
                const selected = form.assignees.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        assignees: selected ? f.assignees.filter((x) => x !== a) : [...f.assignees, a],
                      }))
                    }
                    className={cn(
                      'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                      selected ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface-muted text-ink-muted',
                    )}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          <ToggleGroup
            label="Приоритет"
            options={['Да', 'Нет']}
            value={form.isPriority ? 'Да' : 'Нет'}
            onChange={(v) => setForm((f) => ({ ...f, isPriority: v === 'Да' }))}
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

      <Modal open={!!completingTask} onClose={() => setCompletingTask(null)} title="Результат задачи">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">
            Задача «{completingTask?.title}» будет перенесена в архив.
          </p>
          <Textarea
            label="Результат задачи"
            placeholder="Что сделано по итогу..."
            value={resultDraft}
            onChange={(e) => setResultDraft(e.target.value)}
            autoFocus
          />
          {resultError && <p className="text-sm text-danger">{resultError}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setCompletingTask(null)}>
              Отмена
            </Button>
            <Button type="button" onClick={submitComplete} disabled={!resultDraft.trim() || savingResult}>
              {savingResult ? 'Сохраняем...' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
