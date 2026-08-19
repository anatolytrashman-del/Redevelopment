import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { RAL_PRESETS } from '../../data/ralColors';
import type { RalColor } from '../../data/estimates';

interface RalColorPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (color: Omit<RalColor, 'id'>) => void;
}

const GREY_PRESETS = RAL_PRESETS.filter((p) => p.group === 'grey');
const RED_PRESETS = RAL_PRESETS.filter((p) => p.group === 'red');

// Мини-палитра под покраску фасада — пресеты серых/красных RAL Classic
// (см. data/ralColors.ts) плюс ручной ввод произвольного RAL-кода, если
// нужного оттенка нет в пресетах. hex у пресетов приблизительный — только
// для превью в интерфейсе, окончательный выбор всегда сверяют по вееру RAL.
export function RalColorPickerModal({ open, onClose, onPick }: RalColorPickerModalProps) {
  const [customCode, setCustomCode] = useState('');

  useEffect(() => {
    if (open) setCustomCode('');
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

  return (
    <Modal open={open} onClose={onClose} title="Выбор оттенка RAL">
      <div className="flex flex-col gap-4">
        <ColorGroup title="Серые" presets={GREY_PRESETS} onPick={pickPreset} />
        <ColorGroup title="Красные" presets={RED_PRESETS} onPick={pickPreset} />

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-sm text-ink-muted">Свой RAL-код (если нужного оттенка нет в пресетах)</span>
          <div className="flex gap-2">
            <Input placeholder="Например, RAL 7043" value={customCode} onChange={(e) => setCustomCode(e.target.value)} className="flex-1" />
            <Button type="button" variant="secondary" onClick={pickCustom} disabled={!customCode.trim()}>
              Выбрать
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ColorGroup({
  title,
  presets,
  onPick,
}: {
  title: string;
  presets: typeof RAL_PRESETS;
  onPick: (preset: (typeof RAL_PRESETS)[number]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-ink-muted">{title}</span>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {presets.map((preset) => (
          <button
            key={preset.code}
            type="button"
            onClick={() => onPick(preset)}
            className="flex flex-col items-center gap-1.5 rounded-control border border-border p-2 hover:border-primary/40"
          >
            <span className="h-10 w-full rounded-md border border-black/10" style={{ backgroundColor: preset.hex }} />
            <span className="text-center text-xs font-medium leading-tight text-ink">{preset.code}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
