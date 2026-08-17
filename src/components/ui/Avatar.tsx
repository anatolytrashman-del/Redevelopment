import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';

const sizeClasses = {
  sm: 'h-8 w-8 text-[11px]',
  lg: 'h-20 w-20 text-xl',
} as const;

// Инициалы как заглушка, пока фото нет.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

interface AvatarProps {
  name: string;
  photoPath: string;
  // Закрытый бакет — готового URL в базе нет, ссылку каждый раз подписывают
  // заново. Разные сущности (лиды, подрядчики) держат фото в разных бакетах,
  // поэтому функцию подписи передаёт вызывающий — см. тонкие обёртки
  // LeadAvatar/ContractorAvatar.
  resolveUrl: (path: string) => Promise<string | null>;
  size?: keyof typeof sizeClasses;
  className?: string;
}

export function Avatar({ name, photoPath, resolveUrl, size = 'sm', className }: AvatarProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoPath) {
      setUrl(null);
      return;
    }
    // Запись могла смениться, пока подписывалась ссылка предыдущей — тогда
    // ответ уже не наш, и ставить его в стейт нельзя: в списке появилось бы
    // чужое фото.
    let active = true;
    setUrl(null);
    resolveUrl(photoPath).then((signed) => {
      if (active) setUrl(signed);
    });
    return () => {
      active = false;
    };
  }, [photoPath, resolveUrl]);

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted font-semibold text-ink-muted',
        sizeClasses[size],
        className,
      )}
    >
      {url ? <img src={url} alt={name} className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}
