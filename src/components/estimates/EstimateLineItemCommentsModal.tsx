import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import type { EstimateLineItem, EstimateLineItemComment } from '../../data/estimates';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface EstimateLineItemCommentsModalProps {
  item: EstimateLineItem | null;
  onClose: () => void;
  // Сохраняет строку целиком (с обновлённым comments) — комментарии живут
  // вложенным массивом внутри самой строки (см. data/estimates.ts), не в
  // отдельной таблице, поэтому сохранение идёт тем же PATCH всей сметы,
  // что и у остальных правок строки (см. saveLineItemComments в EstimateDetail.tsx).
  onSave: (item: EstimateLineItem) => Promise<void>;
}

// Комментарии к одной строке построчной сметы — та же лента (дата + текст,
// новые сверху, можно удалить), что и TransactionCommentsModal у Транзакций,
// только без сетевого API на каждое действие: комментарии — часть самой
// строки, сохраняются вместе с ней.
export function EstimateLineItemCommentsModal({ item, onClose, onSave }: EstimateLineItemCommentsModalProps) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft('');
    setError(null);
  }, [item?.id]);

  if (!item) return null;

  async function handleAdd() {
    const body = draft.trim();
    if (!body || saving || !item) return;
    setSaving(true);
    setError(null);
    const comment: EstimateLineItemComment = { id: crypto.randomUUID(), body, createdAt: new Date().toISOString() };
    try {
      await onSave({ ...item, comments: [...item.comments, comment] });
      setDraft('');
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить комментарий'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(comment: EstimateLineItemComment) {
    if (!window.confirm('Удалить комментарий?') || !item) return;
    setError(null);
    try {
      await onSave({ ...item, comments: item.comments.filter((c) => c.id !== comment.id) });
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить комментарий'));
    }
  }

  const sorted = [...item.comments].reverse();

  return (
    <Modal open onClose={onClose} title="Комментарии к строке">
      <div className="flex flex-col gap-4">
        <div className="rounded-control bg-surface-muted p-3 text-sm text-ink-muted">{item.workType}</div>

        <Textarea
          rows={3}
          placeholder="Комментарий к этой строке сметы..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="button" variant="secondary" className="w-fit" disabled={!draft.trim() || saving} onClick={handleAdd}>
          {saving ? 'Сохраняем...' : 'Добавить комментарий'}
        </Button>

        {error && <p className="text-sm text-danger">{error}</p>}

        {sorted.length === 0 && <p className="py-1 text-sm text-ink-faint">Комментариев пока нет.</p>}

        <div className="flex flex-col gap-2">
          {sorted.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3 rounded-control bg-surface-muted p-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-ink-faint">{formatDateTime(c.createdAt)}</span>
                <span className="whitespace-pre-wrap break-words text-sm text-ink">{c.body}</span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(c)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                aria-label="Удалить комментарий"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </Modal>
  );
}
