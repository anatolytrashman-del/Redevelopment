import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import type { Transaction } from '../../data/transactions';
import type { TransactionComment } from '../../data/transactionComments';
import { insertTransactionComment, deleteTransactionComment } from '../../lib/transactionCommentsApi';

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

interface TransactionCommentsModalProps {
  transaction: Transaction | null;
  // Комментарии этой транзакции, старые сверху — старше первыми (порядок
  // как пришёл от fetchTransactionComments), переворачиваем здесь для
  // отображения новых сверху, тем же принципом, что и в LeadDetailModal.
  comments: TransactionComment[];
  onClose: () => void;
  onAdded: (comment: TransactionComment) => void;
  onDeleted: (id: string) => void;
}

// Комментарии к строке транзакции — та же "лента" (дата + текст, новые
// сверху, можно удалить), что и История общения в карточке лида
// (LeadDetailModal.tsx), только в отдельной модалке: у Транзакций нет
// своей карточки-детали, это плоская таблица, открывать целую страницу
// ради пары комментариев было бы лишним.
export function TransactionCommentsModal({ transaction, comments, onClose, onAdded, onDeleted }: TransactionCommentsModalProps) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Компонент не размонтируется между разными транзакциями (см. Transactions.tsx
  // — одна и та же модалка на всю страницу, меняется только проп) — без сброса
  // недописанный черновик или ошибка от прошлой транзакции остались бы видны
  // на следующей.
  useEffect(() => {
    setDraft('');
    setError(null);
  }, [transaction?.id]);

  if (!transaction) return null;

  async function handleAdd() {
    const body = draft.trim();
    if (!body || saving || !transaction) return;
    setSaving(true);
    setError(null);
    try {
      const comment = await insertTransactionComment(transaction.id, body);
      onAdded(comment);
      setDraft('');
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить комментарий'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(comment: TransactionComment) {
    if (!window.confirm('Удалить комментарий?')) return;
    try {
      await deleteTransactionComment(comment.id);
      onDeleted(comment.id);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить комментарий'));
    }
  }

  const sorted = [...comments].reverse();

  return (
    <Modal open onClose={onClose} title="Комментарии">
      <div className="flex flex-col gap-4">
        <div className="rounded-control bg-surface-muted p-3 text-sm text-ink-muted">{transaction.purpose}</div>

        <Textarea
          rows={3}
          placeholder="Комментарий к этой транзакции..."
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
