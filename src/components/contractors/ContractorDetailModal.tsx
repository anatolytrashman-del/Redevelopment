import { Cake, Pencil, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ContactValue } from '../ui/ContactValue';
import { ContractorAvatar } from './ContractorAvatar';
import { contactDuplicatesDedicatedField, isBirthdayToday, type Contractor } from '../../data/contractors';
import { formatPhoneDisplay } from '../../lib/formatPhone';

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Без года — год рождения для дня рождения не важен (см. isBirthdayToday),
// а полная дата с годом уже неявно видна в самой форме редактирования.
function formatBirthday(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', timeZone: 'UTC' });
}

// Строка «поле — значение» — тот же паттерн, что и Field в LeadDetailModal.tsx.
function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  const empty = children === '' || children == null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="break-words text-sm text-ink">{empty ? '—' : children}</span>
    </div>
  );
}

interface ContractorDetailModalProps {
  contractor: Contractor | null;
  onClose: () => void;
  onEdit: (c: Contractor) => void;
  onDelete: (c: Contractor) => void;
  deleting: boolean;
}

// Промежуточный шаг между маленькой карточкой в списке и формой редактирования —
// тот же приём, что и карточка лида (LeadDetailModal.tsx), но проще: у
// подрядчика нет ленты истории общения, только статичные поля.
export function ContractorDetailModal({ contractor, onClose, onEdit, onDelete, deleting }: ContractorDetailModalProps) {
  if (!contractor) return null;

  return (
    <Modal open onClose={onClose} title="Карточка подрядчика">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <ContractorAvatar name={contractor.name} photoPath={contractor.photoPath} size="lg" />
          <div className="flex min-w-0 flex-col gap-2">
            <span className="flex items-center gap-1.5 break-words text-lg font-bold text-ink">
              {contractor.name}
              {isBirthdayToday(contractor.birthday) && (
                <Cake className="h-4 w-4 shrink-0 text-primary" aria-label="Сегодня день рождения">
                  <title>Сегодня день рождения</title>
                </Cake>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {contractor.teamTier && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {contractor.teamTier}
                </span>
              )}
              {contractor.specialty && (
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink-muted">
                  {contractor.specialty}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Способ связи">{contractor.contactMethod}</Field>
          {!contactDuplicatesDedicatedField(contractor) && (
            <Field label="Контакт">
              <ContactValue contact={contractor.contact} contactMethod={contractor.contactMethod} interactive={false} />
            </Field>
          )}
          <Field label="Телефон">{contractor.phone ? formatPhoneDisplay(contractor.phone) : null}</Field>
          <Field label="Email">{contractor.email}</Field>
          <Field label="Зона ответственности">{contractor.responsibilityZone}</Field>
          <Field label="День рождения">{contractor.birthday ? formatBirthday(contractor.birthday) : null}</Field>
          <Field label="Добавлен">{formatDate(contractor.createdAt)}</Field>
        </div>

        <div className="flex flex-col gap-1.5 border-t border-border pt-4">
          <span className="text-sm font-semibold text-ink">Условия оплаты</span>
          <span className="whitespace-pre-wrap break-words text-sm text-ink-muted">
            {contractor.paymentTerms || '—'}
          </span>
        </div>

        <div className="flex flex-col gap-1.5 border-t border-border pt-4">
          <span className="text-sm font-semibold text-ink">Заметки</span>
          <span className="whitespace-pre-wrap break-words text-sm text-ink-muted">{contractor.notes || '—'}</span>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            icon={<Trash2 className="h-4 w-4" />}
            disabled={deleting}
            onClick={() => onDelete(contractor)}
          >
            Удалить
          </Button>
          <Button type="button" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(contractor)}>
            Редактировать
          </Button>
        </div>
      </div>
    </Modal>
  );
}
