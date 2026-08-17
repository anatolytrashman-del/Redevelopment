import { useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Textarea } from '../ui/Textarea';
import { Input } from '../ui/Input';
import { ReferencePopup } from './ReferencePopup';
import { cn } from '../../lib/cn';
import { pinHasReference, type PhotoPin } from '../../data/briefs';
import { uploadObjectImage } from '../../lib/objectsApi';

function Marker({ index, x, y }: { index: number; x: number; y: number }) {
  return (
    <div
      style={{ left: `${x}%`, top: `${y}%` }}
      className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow-sm"
    >
      {index + 1}
    </div>
  );
}

interface AnnotatedPhotoProps {
  url: string;
  pins: PhotoPin[];
  // Редактируемый режим — клик по фото ставит точку, комментарий можно
  // печатать и удалять. В режиме просмотра (публичная страница) — только
  // метки и текст, без взаимодействия.
  editable?: boolean;
  onAddPin?: (x: number, y: number) => void;
  onChangeComment?: (pinId: string, comment: string) => void;
  onRemovePin?: (pinId: string) => void;
  onChangeReferenceImage?: (pinId: string, url: string) => void;
  onChangeReferenceDescription?: (pinId: string, description: string) => void;
  onChangeReferenceUrl?: (pinId: string, url: string) => void;
  // Крупный показ внутри PhotoLightbox — фото на всю ширину (то же, что и
  // на публичной странице), список комментариев под ним, а не сбоку: так
  // фото занимает максимум места и по нему реально удобно кликать точками.
  large?: boolean;
  // Другие фото этой же категории (и "до", и "после") — чтобы не расставлять
  // одни и те же точки вручную заново на похожем кадре, можно скопировать
  // текущий набор точек с комментариями на один или несколько из них.
  copyTargets?: { url: string; label: string }[];
  onCopyPins?: (targetUrls: string[]) => void;
}

// Фото с точками-комментариями поверх — клик по фото (в редактируемом
// режиме) ставит точку и заводит для неё пустой комментарий. Список
// комментариев показан под фото, пронумерован в тон меткам на самом
// фото — что и как менять в этом месте. Удаление самого фото — забота
// вызывающего (миниатюра в PhotoThumbGrid), не этого компонента.
//
// aspect-[16/9] у фото — намеренно тот же, что и у PinnedPhotoCarousel: у
// object-cover кадрирование зависит от соотношения сторон контейнера, и при
// разных aspect-ratio в двух местах одна и та же точка (x/y в процентах)
// визуально съезжает. Единственный способ не ловить этот баг — держать
// соотношение сторон одинаковым везде, где рисуются реальные метки.
export function AnnotatedPhoto({
  url,
  pins,
  editable = false,
  onAddPin,
  onChangeComment,
  onRemovePin,
  onChangeReferenceImage,
  onChangeReferenceDescription,
  onChangeReferenceUrl,
  large = false,
  copyTargets,
  onCopyPins,
}: AnnotatedPhotoProps) {
  const photoRef = useRef<HTMLDivElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [pendingPinId, setPendingPinId] = useState<string | null>(null);
  const [uploadingPinId, setUploadingPinId] = useState<string | null>(null);
  const [openReferencePin, setOpenReferencePin] = useState<PhotoPin | null>(null);
  const [copySelection, setCopySelection] = useState<string[]>([]);

  function toggleCopyTarget(url: string) {
    setCopySelection((sel) => (sel.includes(url) ? sel.filter((u) => u !== url) : [...sel, url]));
  }

  function handleCopy() {
    if (copySelection.length === 0) return;
    onCopyPins?.(copySelection);
    setCopySelection([]);
  }

  function handlePhotoClick(e: MouseEvent<HTMLDivElement>) {
    if (!editable || !onAddPin) return;
    const rect = photoRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onAddPin(x, y);
  }

  function triggerReferenceUpload(pinId: string) {
    setPendingPinId(pinId);
    referenceInputRef.current?.click();
  }

  async function handleReferenceFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const pinId = pendingPinId;
    setPendingPinId(null);
    if (!file || !pinId) return;
    setUploadingPinId(pinId);
    try {
      const url = await uploadObjectImage(file);
      onChangeReferenceImage?.(pinId, url);
    } catch {
      // намеренно молча — необязательное поле, не блокируем работу с формой
    } finally {
      setUploadingPinId(null);
    }
  }

  return (
    <div className={cn('flex flex-col gap-4', !large && 'sm:flex-row')}>
      <div
        ref={photoRef}
        onClick={handlePhotoClick}
        className={cn(
          'relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-control bg-surface-muted',
          !large && 'sm:w-1/2',
          editable && 'cursor-crosshair',
        )}
      >
        <img src={url} alt="" className="pointer-events-none h-full w-full select-none object-cover" />
        {pins.map((pin, i) => (
          <Marker key={pin.id} index={i} x={pin.x} y={pin.y} />
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {pins.length === 0 && (
          <p className="text-sm text-ink-faint">
            {editable ? 'Кликни по фото, чтобы отметить место изменения' : 'Отметок нет'}
          </p>
        )}
        {pins.map((pin, i) => (
          <div key={pin.id} className="flex items-start gap-2">
            <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {i + 1}
            </span>
            {editable ? (
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-start gap-2">
                  <Textarea
                    value={pin.comment}
                    onChange={(e) => onChangeComment?.(pin.id, e.target.value)}
                    rows={2}
                    placeholder="Что изменить в этом месте..."
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => onRemovePin?.(pin.id)}
                    aria-label="Удалить отметку"
                    className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex flex-col gap-2 rounded-control border border-border p-2">
                  <span className="text-xs font-medium text-ink-muted">Референс на модель/товар (необязательно)</span>
                  <div className="flex items-start gap-2">
                    {pin.referenceImageUrl ? (
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                        <img src={pin.referenceImageUrl} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => onChangeReferenceImage?.(pin.id, '')}
                          aria-label="Убрать фото модели"
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink/70 text-white"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => triggerReferenceUpload(pin.id)}
                        disabled={uploadingPinId === pin.id}
                        className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-control border border-dashed border-border text-ink-faint hover:border-border-strong disabled:opacity-50"
                      >
                        {uploadingPinId === pin.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        <span className="text-[9px]">Фото</span>
                      </button>
                    )}
                    <Input
                      placeholder="Ссылка на товар"
                      value={pin.referenceUrl}
                      onChange={(e) => onChangeReferenceUrl?.(pin.id, e.target.value)}
                      className="flex-1 py-2.5"
                    />
                  </div>
                  <Textarea
                    value={pin.referenceDescription}
                    onChange={(e) => onChangeReferenceDescription?.(pin.id, e.target.value)}
                    rows={2}
                    placeholder="Описание модели: материал, цвет, производитель..."
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="whitespace-pre-wrap pt-1 text-sm text-ink">{pin.comment || '—'}</p>
                {pinHasReference(pin) && (
                  <button
                    type="button"
                    onClick={() => setOpenReferencePin(pin)}
                    className="w-fit text-xs font-semibold text-primary underline underline-offset-2"
                  >
                    Референс
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {editable && pins.length > 0 && copyTargets && copyTargets.length > 0 && (
          <div className="flex flex-col gap-2 rounded-control border border-dashed border-border p-2">
            <span className="text-xs font-medium text-ink-muted">Скопировать эти точки на другое фото</span>
            <div className="flex flex-col gap-1">
              {copyTargets.map((t) => (
                <label key={t.url} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={copySelection.includes(t.url)}
                    onChange={() => toggleCopyTarget(t.url)}
                    className="h-4 w-4 accent-primary"
                  />
                  {t.label}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              disabled={copySelection.length === 0}
              className="w-fit rounded-control bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Скопировать
            </button>
          </div>
        )}
      </div>

      <input ref={referenceInputRef} type="file" accept="image/*" className="hidden" onChange={handleReferenceFileChange} />
      {openReferencePin && <ReferencePopup pin={openReferencePin} onClose={() => setOpenReferencePin(null)} />}
    </div>
  );
}
