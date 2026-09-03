import { useEffect, useState } from 'react';
import { X, Save, Trash2, Paperclip } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import type { MaterialLedger } from '../../data/materialLedgers';
import { insertMaterialLedger, updateMaterialLedger, deleteMaterialLedger } from '../../lib/materialLedgersApi';
import type { PurchaseItem } from '../../data/purchases';
import { buildMaterialLedgerXlsx, type LedgerAttachment } from '../../lib/materialLedgerXlsx';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Владелец, 2026-09-03: "хочу реализовать функционал прикрепления ведомостей
// материалов к письму... предложи решение с пресетами, чтобы Альмира могла
// один раз создать ведомость под окна и переиспользовать". Готовые
// ведомости (MaterialLedger) не привязаны ни к запросу, ни к поставщику —
// доступны из композера любого письма. requestItems — позиции ТЕКУЩЕГО
// запроса (категории), с которых удобно начать сборку ведомости вручную, не
// обязательный источник (можно собрать полностью с нуля через "Добавить
// позицию вручную"). "Прикрепить" сразу генерирует .xlsx (см.
// lib/materialLedgerXlsx.ts) и отдаёт наружу — сохранение как пресета
// (кнопка "Сохранить как ведомость") намеренно отдельное действие, тот же
// принцип, что и у "Сохранить как шаблон" в EmailThread.
export function MaterialLedgerModal({
  open,
  requestItems,
  ledgers,
  onClose,
  onLedgersChange,
  onAttach,
}: {
  open: boolean;
  requestItems: PurchaseItem[];
  ledgers: MaterialLedger[];
  onClose: () => void;
  onLedgersChange: (ledgers: MaterialLedger[]) => void;
  onAttach: (attachment: LedgerAttachment) => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [manualName, setManualName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Модалка живёт смонтированной всегда (родитель переключает только open,
  // как и TemplateFormModal) — без сброса по [open] форма подхватила бы
  // состояние только на первом рендере родителя.
  useEffect(() => {
    if (!open) return;
    setSelectedId('');
    setName('');
    setItems([]);
    setManualName('');
    setError(null);
  }, [open]);

  if (!open) return null;

  function pickLedger(id: string) {
    setSelectedId(id);
    setError(null);
    if (!id) {
      setName('');
      setItems([]);
      return;
    }
    const ledger = ledgers.find((l) => l.id === id);
    if (!ledger) return;
    setName(ledger.name);
    setItems(ledger.items);
  }

  function addFromRequest(item: PurchaseItem) {
    if (items.some((i) => i.name === item.name)) return;
    setItems((prev) => [...prev, { ...item, id: crypto.randomUUID() }]);
  }

  function addManualItem() {
    if (!manualName.trim()) return;
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), sourceMaterialId: null, name: manualName.trim(), unit: '', quantity: null, price: null, note: '' },
    ]);
    setManualName('');
  }

  function updateItemQuantity(id: string, quantity: number | null) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity } : i)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const canSubmit = name.trim().length > 0 && items.length > 0;

  async function handleSaveLedger() {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), items };
      const saved = selectedId ? await updateMaterialLedger(selectedId, payload) : await insertMaterialLedger(payload);
      onLedgersChange(ledgers.some((l) => l.id === saved.id) ? ledgers.map((l) => (l.id === saved.id ? saved : l)) : [...ledgers, saved]);
      setSelectedId(saved.id);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить ведомость'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLedger() {
    if (!selectedId || deleting) return;
    if (!window.confirm(`Удалить ведомость «${name}»?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMaterialLedger(selectedId);
      onLedgersChange(ledgers.filter((l) => l.id !== selectedId));
      setSelectedId('');
      setName('');
      setItems([]);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить ведомость'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleAttach() {
    if (!canSubmit || attaching) return;
    setAttaching(true);
    setError(null);
    try {
      const attachment = await buildMaterialLedgerXlsx(name.trim(), items);
      onAttach(attachment);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сформировать файл ведомости'));
    } finally {
      setAttaching(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Ведомость материалов">
      <div className="flex flex-col gap-4">
        {ledgers.length > 0 && (
          <Select
            label="Готовая ведомость"
            placeholder="Новая ведомость"
            options={ledgers.map((l) => l.name)}
            value={ledgers.find((l) => l.id === selectedId)?.name ?? ''}
            onChange={(label) => pickLedger(ledgers.find((l) => l.name === label)?.id ?? '')}
          />
        )}

        <Input label="Название ведомости" placeholder="Например, Окна" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        {requestItems.length > 0 && (
          <div className="flex flex-col gap-2 rounded-control bg-surface-muted p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Позиции запроса</span>
            <div className="flex flex-col gap-1.5">
              {requestItems.map((item) => {
                const added = items.some((i) => i.name === item.name);
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink">
                      {item.name}
                      {item.unit && (
                        <span className="text-ink-faint">
                          {' '}
                          · {item.quantity ?? '—'} {item.unit}
                        </span>
                      )}
                    </span>
                    <Button type="button" variant="secondary" disabled={added} onClick={() => addFromRequest(item)}>
                      {added ? 'Добавлено' : 'Добавить'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-sm text-ink-muted">Позиции ведомости</span>
          {items.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm">
                  <span className="flex-1 text-ink">{item.name}</span>
                  <input
                    type="number"
                    placeholder="Кол-во"
                    value={item.quantity ?? ''}
                    onChange={(e) => updateItemQuantity(item.id, e.target.value === '' ? null : Number(e.target.value))}
                    className="w-20 rounded-control border border-border bg-surface px-2 py-1 text-right text-sm outline-none focus:border-primary"
                  />
                  {item.unit && <span className="w-12 text-ink-faint">{item.unit}</span>}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label="Удалить позицию"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input placeholder="Добавить позицию вручную" value={manualName} onChange={(e) => setManualName(e.target.value)} />
            <Button type="button" variant="secondary" onClick={addManualItem} disabled={!manualName.trim()}>
              Добавить
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            {selectedId && (
              <Button type="button" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={handleDeleteLedger} disabled={deleting}>
                {deleting ? 'Удаляем...' : 'Удалить ведомость'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" icon={<Save className="h-4 w-4" />} onClick={handleSaveLedger} disabled={!canSubmit || saving}>
              {saving ? 'Сохраняем...' : 'Сохранить как ведомость'}
            </Button>
            <Button type="button" icon={<Paperclip className="h-4 w-4" />} onClick={handleAttach} disabled={!canSubmit || attaching}>
              {attaching ? 'Формируем файл...' : 'Прикрепить'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
