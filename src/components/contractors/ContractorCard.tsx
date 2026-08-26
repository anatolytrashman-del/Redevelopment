import { Send, Phone, Mail, MapPin, FileText } from 'lucide-react';
import { ContactValue } from '../ui/ContactValue';
import { ContractorAvatar } from './ContractorAvatar';
import { contactDuplicatesDedicatedField, isBirthdayToday, type Contractor } from '../../data/contractors';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { formatPhoneDisplay } from '../../lib/formatPhone';

// Один вид карточки для "Команды", общего списка подрядчиков (Contractors.tsx)
// и каталога поставщиков (Suppliers.tsx) — разница только в том, из какой
// группы контактов её взяли, вёрстка общая. Вынесена в отдельный файл, чтобы
// не дублировать между двумя страницами. Клик по карточке открывает детальную
// карточку (ContractorDetailModal), не форму редактирования напрямую.
export function ContractorCard({ contractor, onOpen }: { contractor: Contractor; onOpen: (c: Contractor) => void }) {
  return (
    <div
      onClick={() => onOpen(contractor)}
      className={cn(
        'flex w-full cursor-pointer flex-col gap-2 p-4 transition-colors hover:border-primary/40',
        glassCardClass,
      )}
      style={glassCardShadow}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <ContractorAvatar name={contractor.name} photoPath={contractor.photoPath} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="break-words font-semibold text-ink">{contractor.name}</span>
            {isBirthdayToday(contractor.birthday) && (
              <span className="shrink-0 text-base leading-none" role="img" aria-label="Сегодня день рождения" title="Сегодня день рождения">
                🎂
              </span>
            )}
            {contractor.resumePath && (
              <span className="shrink-0" title="Есть резюме">
                <FileText className="h-3.5 w-3.5 text-ink-faint" />
              </span>
            )}
          </div>
          <div className="truncate text-sm text-ink-muted">{contractor.specialty || '—'}</div>
        </div>
      </div>
      {contractor.responsibilityZone && (
        <div className="flex items-center gap-1.5 truncate text-sm text-ink-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {contractor.responsibilityZone}
        </div>
      )}
      {contractor.contact && !contactDuplicatesDedicatedField(contractor) && (
        <div className="flex items-center gap-1.5 truncate text-sm">
          {contractor.contactMethod === 'Telegram' && <Send className="h-3.5 w-3.5 shrink-0 text-ink-faint" />}
          <ContactValue contact={contractor.contact} contactMethod={contractor.contactMethod} interactive={false} />
        </div>
      )}
      {contractor.phone && (
        <div className="flex items-center gap-1.5 truncate text-sm text-ink-muted">
          <Phone className="h-3.5 w-3.5 shrink-0" />
          {formatPhoneDisplay(contractor.phone)}
        </div>
      )}
      {contractor.email && (
        <div className="flex items-center gap-1.5 truncate text-sm text-ink-muted">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          {contractor.email}
        </div>
      )}
    </div>
  );
}
