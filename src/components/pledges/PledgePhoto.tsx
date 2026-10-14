import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import { createPledgePhotoUrl } from '../../lib/pledgesApi';
import { OptimizedImage } from '../common/OptimizedImage'; // AUDIT-2026-10 Task 001

// Закрытый бакет — готового URL в базе нет, ссылку каждый раз подписывают
// заново. Тот же race-guard, что и в Avatar.tsx, но прямоугольный превью
// (миниатюра карточки/галерея в детальной карточке), не круглый аватар.
export function PledgePhoto({ path, className }: { path: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    createPledgePhotoUrl(path).then((signed) => {
      if (active) setUrl(signed);
    });
    return () => {
      active = false;
    };
  }, [path]);

  return (
    <div className={cn('overflow-hidden bg-surface-muted', className)}>
      {url ? (
        <>
          {/* AUDIT-2026-10 Task 001 */}
          <OptimizedImage src={url} alt="" className="h-full w-full object-cover" objectFit="cover" />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="h-5 w-5 text-ink-faint" />
        </div>
      )}
    </div>
  );
}
