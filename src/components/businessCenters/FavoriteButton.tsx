import { Heart } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFavorites } from '../../lib/favoritesContext';

export function FavoriteButton({ slug, className }: { slug: string; className?: string }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(slug);
  return (
    <button
      type="button"
      onClick={(e) => {
        // Карточка/шапка — это <Link>, звёздочка не должна триггерить переход.
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(slug);
      }}
      aria-pressed={active}
      aria-label={active ? 'Убрать из избранного' : 'Добавить в избранное'}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-white',
        className,
      )}
    >
      <Heart className={cn('h-4 w-4 shrink-0', active ? 'fill-primary text-primary' : 'text-ink-muted')} />
    </button>
  );
}
