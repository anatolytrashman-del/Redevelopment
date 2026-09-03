import { useEffect, useState } from 'react';
import { Pencil, Trash2, FileText, Maximize2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ImageLightbox, type LightboxState } from '../objects/ImageLightbox';
import { PledgePhotoCarousel } from './PledgePhotoCarousel';
import type { Pledge } from '../../data/pledges';
import { createPledgePhotoUrl } from '../../lib/pledgesApi';

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
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);

  useEffect(() => {
    setCertificateUrl(null);
    if (!pledge?.certificatePhotoPath) return;
    let active = true;
    createPledgePhotoUrl(pledge.certificatePhotoPath).then((url) => {
      if (active) setCertificateUrl(url);
    });
    return () => {
      active = false;
    };
  }, [pledge?.certificatePhotoPath]);

  if (!pledge) return null;

  return (
    <Modal open onClose={onClose} title="Объект для залога">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="break-words text-lg font-bold text-ink">{pledge.address}</span>
          {pledge.propertyType && (
            <span className="w-fit rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {pledge.propertyType}
            </span>
          )}
        </div>

        {pledge.underConstruction ? (
          <div className="flex flex-col gap-2">
            <span className="w-fit rounded-full bg-warning-bg px-2.5 py-1 text-xs font-semibold text-warning">
              🏗 Ещё не построен
            </span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Сдача">{pledge.completionYear ? `${pledge.completionYear} г.` : null}</Field>
              <Field label="Площадь">{pledge.area ? `${pledge.area} м²` : null}</Field>
              <Field label="Цена покупки">{formatMoney(pledge.purchasePrice)}</Field>
            </div>
          </div>
        ) : (
          <>
            {pledge.photoPaths.length > 0 && (
              // Высота фиксированная, а не aspect-ratio — среди фото могут быть
              // и горизонтальные, и вертикальные вперемешку (см. fit="contain"
              // у PhotoCarousel), под aspect-video вертикальные обрезались бы.
              <div className="relative h-72 w-full overflow-hidden rounded-control bg-surface-muted sm:h-96">
                <PledgePhotoCarousel
                  paths={pledge.photoPaths}
                  alt={pledge.address}
                  fit="contain"
                  onImageClick={(index, urls) => setLightbox({ urls, index })}
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Площадь">{pledge.area ? `${pledge.area} м²` : null}</Field>
              <Field label="Арендный доход">{formatMoney(pledge.rentalIncome)}</Field>
              <Field label="Рыночная стоимость">{formatMoney(pledge.marketValue)}</Field>
              <Field label="Залоговая стоимость">{formatMoney(pledge.pledgeValue)}</Field>
            </div>
          </>
        )}

        {!pledge.underConstruction && pledge.certificatePhotoPath && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-ink-faint">Свидетельство БРТИ</span>
            <button
              type="button"
              onClick={() => certificateUrl && setLightbox({ urls: [certificateUrl], index: 0 })}
              disabled={!certificateUrl}
              className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-control bg-surface-muted disabled:cursor-default"
            >
              {certificateUrl ? (
                <>
                  <img src={certificateUrl} alt="Свидетельство БРТИ" className="h-full w-full cursor-zoom-in object-cover" />
                  <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-ink shadow-sm">
                    <Maximize2 className="h-3 w-3" />
                    Зум
                  </span>
                </>
              ) : (
                <FileText className="h-6 w-6 text-ink-faint" />
              )}
            </button>
          </div>
        )}

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

      <ImageLightbox state={lightbox} onChange={setLightbox} />
    </Modal>
  );
}
