import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../lib/cn';
import { RAL_PRESETS, RAL_GROUP_LABELS, type RalGroup } from '../../data/ralColors';
import type { RalColor } from '../../data/estimates';

interface RalColorPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (color: Omit<RalColor, 'id'>) => void;
}

const GROUPS = Object.keys(RAL_GROUP_LABELS) as RalGroup[];

// Полная палитра RAL Classic (213 цветов, см. data/ralColors.ts) — вкладки
// по группам оттенка + поиск по коду/названию (сквозной, игнорирует
// вкладки). Плюс ручной ввод произвольного RAL-кода, если его почему-то
// нет в таблице. hex приблизительный — только для превью в интерфейсе,
// окончательный выбор всегда сверяют по вееру RAL.
export function RalColorPickerModal({ open, onClose, onPick }: RalColorPickerModalProps) {
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<RalGroup>('grey');
  const [customCode, setCustomCode] = useState('');

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveGroup('grey');
      setCustomCode('');
    }
  }, [open]);

  function pickPreset(preset: (typeof RAL_PRESETS)[number]) {
    onPick({ code: preset.code, name: preset.name, hex: preset.hex });
    onClose();
  }

  function pickCustom() {
    if (!customCode.trim()) return;
    onPick({ code: customCode.trim(), name: '', hex: null });
    onClose();
  }

  const trimmedQuery = query.trim().toLowerCase();
  const visiblePresets = trimmedQuery
    ? RAL_PRESETS.filter(
        (p) => p.code.toLowerCase().includes(trimmedQuery) || p.name.toLowerCase().includes(trimmedQuery),
      )
    : RAL_PRESETS.filter((p) => p.group === activeGroup);

  return (
    <Modal open={open} onClose={onClose} title="Выбор оттенка RAL">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по коду или названию (например, 7016 или антрацит)..."
            className="w-full rounded-control border border-transparent bg-surface-muted py-2.5 pl-10 pr-4 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary"
          />
        </div>

        {!trimmedQuery && (
          <div className="flex flex-wrap gap-1.5">
            {GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setActiveGroup(g)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold',
                  activeGroup === g ? 'border-primary bg-primary/10 text-primary' : 'border-border text-ink-muted hover:border-primary/40',
                )}
              >
                {RAL_GROUP_LABELS[g]}
              </button>
            ))}
          </div>
        )}

        <div className="grid max-h-[45vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {visiblePresets.map((preset) => (
            <button
              key={preset.code}
              type="button"
              onClick={() => pickPreset(preset)}
              title={preset.name}
              className="flex flex-col items-center gap-1.5 rounded-control border border-border p-2 hover:border-primary/40"
            >
              <span className="h-10 w-full rounded-md border border-black/10" style={{ backgroundColor: preset.hex }} />
              <span className="text-center text-xs font-medium leading-tight text-ink">{preset.code}</span>
            </button>
          ))}
          {visiblePresets.length === 0 && (
            <p className="col-span-full py-4 text-center text-sm text-ink-faint">Ничего не найдено</p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-sm text-ink-muted">Свой RAL-код (если нужного оттенка нет в таблице)</span>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Input placeholder="Например, RAL 7043" value={customCode} onChange={(e) => setCustomCode(e.target.value)} />
            </div>
            <Button type="button" variant="secondary" onClick={pickCustom} disabled={!customCode.trim()}>
              Выбрать
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
