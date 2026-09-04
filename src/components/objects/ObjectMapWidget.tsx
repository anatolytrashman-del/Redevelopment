import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Maximize2, Minimize2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { cn } from '../../lib/cn';

interface ObjectMapWidgetProps {
  address: string;
  mapEmbedUrl: string;
  // Свёрнутый (не fullscreen) вид — по умолчанию 4:3, как у карты одного
  // объекта в ObjectDetail.tsx. BusinessCentersMinskPage (владелец: "блок
  // карты слишком большой, давай меньше сделаем его" — на широкой странице
  // 4:3 давал огромную по высоте карту) передаёт более широкое соотношение,
  // fullscreen-режим (кнопка "Зум") не трогается — там всегда h-[75vh].
  aspectClassName?: string;
}

// Ссылка берётся из Яндекс.Карт Конструктора (constructor.yandex.ru) — не
// JS API и не координаты: админ сам находит адрес на карте и копирует
// готовую ссылку на карту с меткой. За счёт этого не нужен свой API-ключ
// Яндекса, а зум/панорамирование в iframe — родные, самого Яндекс.Карт.
export function ObjectMapWidget({ address, mapEmbedUrl, aspectClassName = 'aspect-[4/3]' }: ObjectMapWidgetProps) {
  const [fullscreen, setFullscreen] = useState(false);

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-ink">Расположение на карте</div>
        {mapEmbedUrl && (
          <Button
            type="button"
            variant="secondary"
            icon={fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            onClick={() => setFullscreen((v) => !v)}
          >
            {fullscreen ? 'Свернуть' : 'Зум'}
          </Button>
        )}
      </div>

      {mapEmbedUrl ? (
        <iframe
          src={mapEmbedUrl}
          title={`Карта: ${address}`}
          className={cn('w-full rounded-control border-0', fullscreen ? 'h-[75vh]' : aspectClassName)}
          loading="lazy"
        />
      ) : (
        <div className={cn('flex flex-col items-center justify-center gap-2 rounded-control bg-surface-muted px-4 text-center', aspectClassName)}>
          <MapPin className="h-5 w-5 text-ink-faint" />
          <p className="text-sm text-ink-muted">
            Ссылка на карту ещё не добавлена — впиши её в форме редактирования объекта.
          </p>
        </div>
      )}
    </>
  );

  if (fullscreen) {
    // Портал в document.body — см. комментарий у Modal.tsx: иначе "fixed"
    // считает своим предком ближайшую карточку с backdrop-blur и накрывает
    // не весь экран, а только её область.
    return createPortal(
      <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/60 p-6" onClick={() => setFullscreen(false)}>
        <div
          className={cn('mx-auto flex max-w-6xl flex-col gap-3 p-5', glassCardClass)}
          style={glassCardShadow}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>,
      document.body,
    );
  }

  return <Card className="flex flex-col gap-3 p-5">{content}</Card>;
}
