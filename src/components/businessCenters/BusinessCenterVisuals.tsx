import type { ReactNode } from 'react';
import { Camera, HardHat } from 'lucide-react';
import type { BusinessCenter } from '../../data/businessCenters';

// Общие мелкие визуальные блоки БЦ — используются и на хабе
// (BusinessCentersMinskPage.tsx, компактная карточка), и на отдельной
// странице конкретного БЦ (BusinessCenterDetailPage.tsx, крупное фото) —
// вынесены сюда, чтобы не дублировать (тот же принцип, что и у
// lib/businessCenterDisplay.ts рядом).
export function PhotoBlock({ center }: { center: BusinessCenter }) {
  if (center.photos.length > 0) {
    return <img src={center.photos[0]} alt={center.name} className="h-full w-full object-cover" loading="lazy" />;
  }
  // Фото ещё нет — владелец добавит сам (см. комментарий в data-файле).
  // Тот же визуальный приём, что у карточки "ещё не построен" в Залогах
  // (Objects.tsx) — заливка градиентом вместо пустого места; для строящихся
  // объектов бейдж говорит про стройку, а не про "фото скоро появятся".
  if (center.status === 'under_construction') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-muted to-border">
        <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink shadow-sm">
          <HardHat className="h-3.5 w-3.5 shrink-0" />
          {center.yearBuilt ? `Строится · сдача в ${center.yearBuilt} г.` : 'Строится'}
        </span>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-muted to-border">
      <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink-muted shadow-sm">
        <Camera className="h-3.5 w-3.5 shrink-0" />
        Фото скоро
      </span>
    </div>
  );
}

export function FactRow({ icon: Icon, children }: { icon: typeof Camera; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-ink-muted">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
      <span>{children}</span>
    </div>
  );
}
