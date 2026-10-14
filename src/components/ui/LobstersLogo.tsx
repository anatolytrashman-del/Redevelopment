import logo from '../../assets/logo.png';
import { cn } from '../../lib/cn';
import { OptimizedImage } from '../common/OptimizedImage'; // AUDIT-2026-10 Task 001

export function LobstersLogo({ className }: { className?: string }) {
  return <OptimizedImage src={logo} alt="Lobsters" className={cn('h-auto w-full object-contain', className)} objectFit="contain" />;
}
