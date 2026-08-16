import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import { createLeadPhotoUrl } from '../../lib/leadsApi';

const sizeClasses = {
  sm: 'h-8 w-8 text-[11px]',
  lg: 'h-20 w-20 text-xl',
} as const;

// Инициалы как заглушка, пока фото нет (у большинства лидов его и не будет).
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

interface LeadAvatarProps {
  name: string;
  photoPath: string;
  size?: keyof typeof sizeClasses;
  className?: string;
}

// Бакет lead-photos закрытый, поэтому готового URL в базе нет — на каждый показ
// подписываем ссылку заново (см. createLeadPhotoUrl). Пока подпись едет по сети
// и если она не удалась, показываем инициалы: битой картинки пользователь не
// увидит никогда.
export function LeadAvatar({ name, photoPath, size = 'sm', className }: LeadAvatarProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoPath) {
      setUrl(null);
      return;
    }
    // Лид мог смениться, пока подписывалась ссылка предыдущего — тогда ответ
    // уже не наш, и ставить его в стейт нельзя: в списке появилось бы чужое фото.
    let active = true;
    setUrl(null);
    createLeadPhotoUrl(photoPath).then((signed) => {
      if (active) setUrl(signed);
    });
    return () => {
      active = false;
    };
  }, [photoPath]);

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted font-semibold text-ink-muted',
        sizeClasses[size],
        className,
      )}
    >
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
