import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { PhotoCarousel } from '../objects/PhotoCarousel';
import { createPledgePhotoUrl } from '../../lib/pledgesApi';

// Фото залога лежат в приватном бакете — путь, а не готовый URL (см.
// PledgePhoto.tsx), поэтому перед тем как отдать в общий PhotoCarousel
// (который принимает уже готовые ссылки, как у RealtyObject.photoUrls),
// подписываем все пути разом. Родитель должен быть position:relative +
// overflow:hidden — сам компонент своей обёртки не рисует, как и PhotoCarousel.
// onImageClick получает уже подписанные ссылки — родителю (например,
// PledgeDetailModal) для лайтбокса нужен весь массив, не только индекс.
export function PledgePhotoCarousel({
  paths,
  alt,
  onImageClick,
}: {
  paths: string[];
  alt?: string;
  onImageClick?: (index: number, urls: string[]) => void;
}) {
  const [urls, setUrls] = useState<string[] | null>(null);
  const pathsKey = paths.join('|');

  useEffect(() => {
    let active = true;
    setUrls(null);
    Promise.all(paths.map((p) => createPledgePhotoUrl(p))).then((resolved) => {
      if (active) setUrls(resolved.filter((u): u is string => !!u));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey]);

  if (urls == null) {
    return <div className="h-full w-full animate-pulse bg-surface-muted" />;
  }

  if (urls.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <ImageOff className="h-6 w-6 text-ink-faint" />
      </div>
    );
  }

  return <PhotoCarousel images={urls} alt={alt} onImageClick={onImageClick ? (index) => onImageClick(index, urls) : undefined} />;
}
