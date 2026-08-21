import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, CheckCircle2, Trash2, Flame, Pencil, ChevronRight } from 'lucide-react';
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

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayIsoDate() {
  return isoDate(new Date());
}

function tomorrowIsoDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

// Понедельник текущей недели — getDay() воскресенье=0, поэтому сдвигаем на
// европейскую неделю (Пн=0 ... Вс=6).
function startOfWeekIsoDate() {
  const d = new Date();
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset);
  return isoDate(d);
}

function startOfMonthIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function ActiveTaskCard({
  task,
  onComplete,
  onEdit,
  onDelete,
  deleting,
}: {
  task: Task;
  onComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  deleting: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-muted">{formatDate(task.date)}</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            icon={<CheckCircle2 className="h-4 w-4" />}
            onClick={() => onComplete(task)}
          >
            Пометить выполненной
          </Button>
          <button
            type="button"
            onClick={() => onEdit(task)}
            aria-label="Редактировать задачу"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(task)}
            disabled={deleting}
            aria-label="Удалить задачу"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function ArchivedTaskCard({
  task,
  onEdit,
  onDelete,
  deleting,
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  deleting: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5 opacity-80">
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
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="flex w-fit items-center gap-2 text-sm font-medium text-ink-muted hover:text-primary"
        >
          <Pencil className="h-3.5 w-3.5" />
          Редактировать
        </button>
        <button
          type="button"
          onClick={() => onDelete(task)}
          disabled={deleting}
          className="flex w-fit items-center gap-2 text-sm font-medium text-ink-muted hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Удалить
        </button>
      </div>
    </Card>
  );
}

// Свёрнутая по умолчанию группа — чтобы страница не разрасталась, видимыми
// сразу остаются только "Задачи на сегодня" (не спойлер) и "Задачи на завтра"
// (defaultOpen, см. Tasks ниже), всё остальное открывается по клику.
function Spoiler({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-left text-lg font-bold text-ink"
      >
        <ChevronRight className={cn('h-5 w-5 shrink-0 text-ink-faint transition-transform', open && 'rotate-90')} />
        {title}
        <span className="text-sm font-medium text-ink-faint">{count}</span>
      </button>
      {open && children}
    </div>
  );
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
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
  // Просроченные (date < сегодня) остаются в "на сегодня" — не хотим, чтобы
  // они потерялись под спойлером "на другие дни".
  const todayTasks = useMemo(() => {
    const today = todayIsoDate();
    return activeTasks.filter((t) => t.date <= today);
  }, [activeTasks]);
  const tomorrowTasks = useMemo(() => {
    const tomorrow = tomorrowIsoDate();
    return activeTasks.filter((t) => t.date === tomorrow);
  }, [activeTasks]);
  const otherTasks = useMemo(() => {
    const tomorrow = tomorrowIsoDate();
    return activeTasks.filter((t) => t.date > tomorrow);
  }, [activeTasks]);

  const archivedTasks = useMemo(
    () => [...tasks.filter((t) => t.isDone)].sort((a, b) => b.date.localeCompare(a.date)),
    [tasks],
  );
  // Бакеты архива считаются по дате задачи (date), отдельного поля даты
  // выполнения в Task нет — на практике задача обычно закрывается около
  // своей даты, так что это достаточная оценка "когда сделано".
  const doneToday = useMemo(() => {
    const today = todayIsoDate();
    return archivedTasks.filter((t) => t.date === today);
  }, [archivedTasks]);
  const doneThisWeek = useMemo(() => {
    const today = todayIsoDate();
    const weekStart = startOfWeekIsoDate();
    return archivedTasks.filter((t) => t.date !== today && t.date >= weekStart);
  }, [archivedTasks]);
  const doneThisMonth = useMemo(() => {
    const weekStart = startOfWeekIsoDate();
    const monthStart = startOfMonthIsoDate();
    return archivedTasks.filter((t) => t.date < weekStart && t.date >= monthStart);
  }, [archivedTasks]);
  const doneOlder = useMemo(() => {
    const monthStart = startOfMonthIsoDate();
    return archivedTasks.filter((t) => t.date < monthStart);
  }, [archivedTasks]);

  const canSubmit = form.title.trim() && form.date && form.assignees.length > 0;

  function openAddModal() {
    setEditingTask(null);
    setForm(emptyForm);
    setSubmitError(null);
    setOpen(true);
  }

  function openEditModal(task: Task) {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description,
      date: task.date,
      assignees: task.assignees,
      isPriority: task.isPriority,
    });
    setSubmitError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      if (editingTask) {
        const updated = await updateTask(editingTask.id, {
          title: form.title.trim(),
          description: form.description.trim(),
          date: form.date,
          assignees: form.assignees,
          isPriority: form.isPriority,
          isDone: editingTask.isDone,
          result: editingTask.result,
        });
        setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? updated : t)));
      } else {
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
      }
      setForm(emptyForm);
      setEditingTask(null);
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

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем задачи...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="text-lg font-bold text-ink">Задачи на сегодня</div>
            {todayTasks.map((task) => (
              <ActiveTaskCard
                key={task.id}
                task={task}
                onComplete={openCompleteModal}
                onEdit={openEditModal}
                onDelete={handleDelete}
                deleting={deletingId === task.id}
              />
            ))}
            {todayTasks.length === 0 && (
              <Card className="py-10 text-center text-sm text-ink-muted">На сегодня задач нет</Card>
            )}
          </div>

          <Spoiler title="Задачи на завтра" count={tomorrowTasks.length} defaultOpen>
            {tomorrowTasks.map((task) => (
              <ActiveTaskCard
                key={task.id}
                task={task}
                onComplete={openCompleteModal}
                onEdit={openEditModal}
                onDelete={handleDelete}
                deleting={deletingId === task.id}
              />
            ))}
            {tomorrowTasks.length === 0 && (
              <Card className="py-10 text-center text-sm text-ink-muted">На завтра задач нет</Card>
            )}
          </Spoiler>

          <Spoiler title="Задачи на другие дни" count={otherTasks.length}>
            {otherTasks.map((task) => (
              <ActiveTaskCard
                key={task.id}
                task={task}
                onComplete={openCompleteModal}
                onEdit={openEditModal}
                onDelete={handleDelete}
                deleting={deletingId === task.id}
              />
            ))}
            {otherTasks.length === 0 && (
              <Card className="py-10 text-center text-sm text-ink-muted">Задач на другие дни нет</Card>
            )}
          </Spoiler>
        </div>
      )}
      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

      {!loading && archivedTasks.length > 0 && (
        <div className="flex flex-col gap-6">
          <Spoiler title="Сделано за сегодня" count={doneToday.length}>
            {doneToday.map((task) => (
              <ArchivedTaskCard
                key={task.id}
                task={task}
                onEdit={openEditModal}
                onDelete={handleDelete}
                deleting={deletingId === task.id}
              />
            ))}
            {doneToday.length === 0 && (
              <Card className="py-10 text-center text-sm text-ink-muted">Сегодня ничего не выполнено</Card>
            )}
          </Spoiler>

          <Spoiler title="Сделано за эту неделю" count={doneThisWeek.length}>
            {doneThisWeek.map((task) => (
              <ArchivedTaskCard
                key={task.id}
                task={task}
                onEdit={openEditModal}
                onDelete={handleDelete}
                deleting={deletingId === task.id}
              />
            ))}
            {doneThisWeek.length === 0 && (
              <Card className="py-10 text-center text-sm text-ink-muted">На этой неделе ничего не выполнено</Card>
            )}
          </Spoiler>

          <Spoiler title="Сделано за этот месяц" count={doneThisMonth.length}>
            {doneThisMonth.map((task) => (
              <ArchivedTaskCard
                key={task.id}
                task={task}
                onEdit={openEditModal}
                onDelete={handleDelete}
                deleting={deletingId === task.id}
              />
            ))}
            {doneThisMonth.length === 0 && (
              <Card className="py-10 text-center text-sm text-ink-muted">В этом месяце ничего не выполнено</Card>
            )}
          </Spoiler>

          <Spoiler title="Архив" count={doneOlder.length}>
            {doneOlder.map((task) => (
              <ArchivedTaskCard
                key={task.id}
                task={task}
                onEdit={openEditModal}
                onDelete={handleDelete}
                deleting={deletingId === task.id}
              />
            ))}
            {doneOlder.length === 0 && <Card className="py-10 text-center text-sm text-ink-muted">Архив пуст</Card>}
          </Spoiler>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingTask ? 'Редактировать задачу' : 'Новая задача'}>
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
              {submitting ? 'Сохраняем...' : editingTask ? 'Сохранить' : 'Добавить'}
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
