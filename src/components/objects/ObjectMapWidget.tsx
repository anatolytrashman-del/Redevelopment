import { useState } from 'react';
import { MapPin, Maximize2, Minimize2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { cn } from '../../lib/cn';

interface ObjectMapWidgetProps {
  address: string;
  mapEmbedUrl: string;
}

// Ссылка берётся из Яндекс.Карт Конструктора (constructor.yandex.ru) — не
// JS API и не координаты: админ сам находит адрес на карте и копирует
// готовую ссылку на карту с меткой. За счёт этого не нужен свой API-ключ
// Яндекса, а зум/панорамирование в iframe — родные, самого Яндекс.Карт.
export function ObjectMapWidget({ address, mapEmbedUrl }: ObjectMapWidgetProps) {
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
            {fullscreen ? 'Свернуть' : 'На весь экран'}
          </Button>
        )}
      </div>

      {mapEmbedUrl ? (
        <iframe
          src={mapEmbedUrl}
          title={`Карта: ${address}`}
          className={cn('w-full rounded-control border-0', fullscreen ? 'h-[75vh]' : 'aspect-[4/3]')}
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-control bg-surface-muted px-4 text-center">
          <MapPin className="h-5 w-5 text-ink-faint" />
          <p className="text-sm text-ink-muted">
            Ссылка на карту ещё не добавлена — впиши её в форме редактирования объекта.
          </p>
        </div>
      )}
    </>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/60 p-6" onClick={() => setFullscreen(false)}>
        <div
          className={cn('mx-auto flex max-w-6xl flex-col gap-3 p-5', glassCardClass)}
          style={glassCardShadow}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    );
  }

  return <Card className="flex flex-col gap-3 p-5">{content}</Card>;
}
