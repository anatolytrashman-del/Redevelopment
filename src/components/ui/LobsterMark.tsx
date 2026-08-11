import lobster from '../../assets/lobster.png';
import { cn } from '../../lib/cn';

export function LobsterMark({ className }: { className?: string }) {
  return <img src={lobster} alt="" aria-hidden="true" className={cn('h-auto w-full object-contain', className)} />;
}
