import { Pencil, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { PledgePhoto } from './PledgePhoto';
import type { Pledge } from '../../data/pledges';

function formatMoney(value: number): string {
  return value ? `$${Math.round(value).toLocaleString('ru-RU')}` : '';
}

// Строка «поле — значение» — тот же паттерн, что и Field в
// LeadDetailModal.tsx/ContractorDetailModal.tsx.
function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  const empty = children === '' || children == null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="break-words text-sm text-ink">{empty ? '—' : children}</span>
    </div>
  );
}

interface PledgeDetailModalProps {
  pledge: Pledge | null;
  onClose: () => void;
  onEdit: (p: Pledge) => void;
  onDelete: (p: Pledge) => void;
  deleting: boolean;
}

// Промежуточный шаг между карточкой в списке и формой редактирования — тот
// же приём, что и карточка лида/подрядчика.
export function PledgeDetailModal({ pledge, onClose, onEdit, onDelete, deleting }: PledgeDetailModalProps) {
  if (!pledge) return null;

  return (
    <Modal open onClose={onClose} title="Объект в залоге">
      <div className="flex flex-col gap-5">
        <span className="break-words text-lg font-bold text-ink">{pledge.address}</span>

        {pledge.photoPaths.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {pledge.photoPaths.map((path) => (
              <PledgePhoto key={path} path={path} className="aspect-square rounded-control" />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Площадь">{pledge.area ? `${pledge.area} м²` : null}</Field>
          <Field label="Арендный доход">{formatMoney(pledge.rentalIncome)}</Field>
          <Field label="Рыночная стоимость">{formatMoney(pledge.marketValue)}</Field>
          <Field label="Залоговая стоимость">{formatMoney(pledge.pledgeValue)}</Field>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            icon={<Trash2 className="h-4 w-4" />}
            disabled={deleting}
            onClick={() => onDelete(pledge)}
          >
            Удалить
          </Button>
          <Button type="button" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(pledge)}>
            Редактировать
          </Button>
        </div>
      </div>
    </Modal>
  );
}
