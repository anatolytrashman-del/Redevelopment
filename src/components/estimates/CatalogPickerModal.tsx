import { useEffect, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import type { EstimateCatalogItem } from '../../data/estimateCatalog';
import { insertEstimateCatalogItem } from '../../lib/estimateCatalogApi';
import { cn } from '../../lib/cn';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

interface CatalogPickerModalProps {
  open: boolean;
  onClose: () => void;
  items: EstimateCatalogItem[];
  // Отдаёт сырой элемент каталога — вызывающая сторона сама решает, как его
  // применить: раздел (EstimateSection.body) форматирует в текст и
  // дописывает, форма позиции (EstimatePositionFormModal) раскладывает
  // title/ops по своим полям формы. Модалка не закрывается после вставки —
  // можно добавить несколько позиций подряд за один заход (кроме формы
  // позиции, где вызывающая сторона сама закрывает после выбора одной).
  onInsert: (item: EstimateCatalogItem) => void;
  onCreated: (item: EstimateCatalogItem) => void;
}

// Каталог типовых позиций сметы (см. data/estimateCatalog.ts) — открывается
// из раздела сметы кнопкой "Добавить из каталога". Ниже своего списка —
// форма "Новой позиции": если нужной ещё нет, сразу заводим её в общий
// каталог (пригодится на других объектах) и вставляем в текущий раздел.
export function CatalogPickerModal({ open, onClose, items, onInsert, onCreated }: CatalogPickerModalProps) {
  const [query, setQuery] = useState('');
  const [insertedId, setInsertedId] = useState<string | null>(null);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newOps, setNewOps] = useState('');
  const [newMaterials, setNewMaterials] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setInsertedId(null);
    setShowNewForm(false);
    setNewTitle('');
    setNewOps('');
    setNewMaterials('');
    setCreateError(null);
  }, [open]);

  const filtered = items.filter((item) => item.title.toLowerCase().includes(query.trim().toLowerCase()));

  function handleInsertExisting(item: EstimateCatalogItem) {
    onInsert(item);
    setInsertedId(item.id);
    setTimeout(() => setInsertedId((id) => (id === item.id ? null : id)), 1200);
  }

  async function handleCreate() {
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const ops = newOps
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const created = await insertEstimateCatalogItem({ title: newTitle.trim(), ops, materials: newMaterials.trim() });
      onCreated(created);
      onInsert(created);
      setShowNewForm(false);
      setNewTitle('');
      setNewOps('');
      setNewMaterials('');
    } catch (err) {
      setCreateError(errorMessage(err, 'Не удалось добавить позицию'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Каталог позиций">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по каталогу..."
            className="w-full rounded-control border border-transparent bg-surface-muted py-2.5 pl-10 pr-4 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary"
          />
        </div>

        <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleInsertExisting(item)}
              className="flex flex-col gap-1 rounded-control border border-border p-3 text-left hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{item.title}</span>
                <span
                  className={cn(
                    'flex shrink-0 items-center gap-1 text-xs font-semibold',
                    insertedId === item.id ? 'text-success' : 'text-primary',
                  )}
                >
                  {insertedId === item.id ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Добавлено
                    </>
                  ) : (
                    'Добавить'
                  )}
                </span>
              </div>
              {item.ops.length > 0 && (
                <span className="truncate text-xs text-ink-muted">{item.ops.join(' · ')}</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-ink-faint">
              {items.length === 0 ? 'Каталог пока пуст' : 'Ничего не найдено'}
            </p>
          )}
        </div>

        <div className="border-t border-border pt-4">
          {showNewForm ? (
            <div className="flex flex-col gap-3">
              <Input label="Название позиции" placeholder="Например, Укладка плитки" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <Textarea
                label="Состав работ (каждый пункт с новой строки)"
                placeholder={'Подготовка основания\nГидроизоляция\nУкладка плитки\nЗатирка швов'}
                value={newOps}
                onChange={(e) => setNewOps(e.target.value)}
                rows={4}
              />
              <Input label="Материалы" placeholder="Плитка, клей, затирка, гидроизоляция..." value={newMaterials} onChange={(e) => setNewMaterials(e.target.value)} />
              {createError && <p className="text-sm text-danger">{createError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setShowNewForm(false)}>
                  Отмена
                </Button>
                <Button type="button" onClick={handleCreate} disabled={!newTitle.trim() || creating}>
                  {creating ? 'Добавляем...' : 'Добавить в каталог и вставить'}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} className="w-fit" onClick={() => setShowNewForm(true)}>
              Новая позиция
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
