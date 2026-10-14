import lobster from '../../assets/lobster.png';
import { cn } from '../../lib/cn';
import { OptimizedImage } from '../common/OptimizedImage'; // AUDIT-2026-10 Task 001

export function LobsterMark({ className }: { className?: string }) {
  return <OptimizedImage src={lobster} alt="" aria-hidden="true" className={cn('h-auto w-full object-contain', className)} objectFit="contain" />;
}
