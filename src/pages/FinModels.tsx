import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Trash2, CopyPlus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import type { FinModel } from '../data/finModels';
import type { RealtyObject } from '../data/objects';
import { fetchFinModels, insertFinModel, deleteFinModel, duplicateFinModel } from '../lib/finModelsApi';
import { fetchObjects } from '../lib/objectsApi';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function objectLabel(o: RealtyObject): string {
  return o.name ? `${o.name} — ${o.address}` : o.address;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function FinModels() {
  const navigate = useNavigate();
  const [models, setModels] = useState<FinModel[]>([]);
  const [objects, setObjects] = useState<RealtyObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [pickedLabel, setPickedLabel] = useState('');
  const [newName, setNewName] = useState('Базовый сценарий');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchFinModels(), fetchObjects()])
      .then(([m, o]) => {
        setModels(m);
        setObjects(o);
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить финмодели')))
      .finally(() => setLoading(false));
  }, []);

  function objectFor(model: FinModel): RealtyObject | undefined {
    return objects.find((o) => o.id === model.objectId);
  }

  function openCreateModal() {
    setPickedLabel('');
    setNewName('Базовый сценарий');
    setCreateError(null);
    setOpen(true);
  }

  async function handleCreate() {
    const picked = objects.find((o) => objectLabel(o) === pickedLabel);
    if (!picked || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await insertFinModel({ objectId: picked.id, name: newName.trim() || 'Базовый сценарий' });
      setModels((prev) => [created, ...prev]);
      setOpen(false);
      navigate(`/admin/finmodels/${created.id}`);
    } catch (err) {
      setCreateError(errorMessage(err, 'Не удалось создать финмодель'));
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicate(m: FinModel) {
    if (duplicatingId) return;
    setDuplicatingId(m.id);
    setActionError(null);
    try {
      const copy = await duplicateFinModel(m);
      setModels((prev) => [copy, ...prev]);
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось создать копию'));
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleDelete(m: FinModel) {
    if (deletingId) return;
    if (!window.confirm(`Удалить финмодель «${m.name}»?`)) return;
    setDeletingId(m.id);
    setActionError(null);
    try {
      await deleteFinModel(m.id);
      setModels((prev) => prev.filter((x) => x.id !== m.id));
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось удалить финмодель'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Финмодели"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openCreateModal}>
            Добавить финмодель
          </Button>
        }
      />

      {actionError && <p className="text-sm text-danger">{actionError}</p>}

      <div className="flex flex-col gap-3">
        {models.map((m) => {
          const obj = objectFor(m);
          return (
            <div
              key={m.id}
              onClick={() => navigate(`/admin/finmodels/${m.id}`)}
              className={cn(
                'flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between',
                glassCardClass,
              )}
              style={glassCardShadow}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-semibold text-ink">{m.name}</span>
                <span className="truncate text-sm text-ink-muted">{obj ? objectLabel(obj) : 'Объект удалён'}</span>
                <span className="text-xs text-ink-faint">создана {formatDate(m.createdAt)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    handleDuplicate(m);
                  }}
                  disabled={duplicatingId === m.id}
                  title="Создать копию (сценарий)"
                  aria-label="Создать копию"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:text-primary disabled:opacity-50"
                >
                  {duplicatingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CopyPlus className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    handleDelete(m);
                  }}
                  disabled={deletingId === m.id}
                  aria-label="Удалить финмодель"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем финмодели...
          </Card>
        )}
        {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
        {!loading && !loadError && models.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Финмоделей пока нет</Card>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Новая финмодель">
        <div className="flex flex-col gap-4">
          <Select
            label="Объект"
            placeholder="Выберите объект"
            options={objects.map(objectLabel)}
            value={pickedLabel}
            onChange={setPickedLabel}
          />
          <Input
            label="Название сценария"
            placeholder="Базовый сценарий"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          {createError && <p className="text-sm text-danger">{createError}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={handleCreate} disabled={!pickedLabel || creating}>
              {creating ? 'Создаём...' : 'Создать'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
