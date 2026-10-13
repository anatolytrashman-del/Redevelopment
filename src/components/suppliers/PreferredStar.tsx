import { Star } from 'lucide-react';
import { cn } from '../../lib/cn';

// Избранный поставщик. В каталоге рядом бывает подпись, в переписке хватает
// самой звезды: имя компании и так на экране.
export function PreferredStar({ className }: { className?: string }) {
  return <Star className={cn('inline h-3.5 w-3.5 shrink-0 fill-current text-ink', className)} aria-label="Избранный" />;
}
