import logo from '../../assets/logo.png';
import { cn } from '../../lib/cn';

export function LobstersLogo({ className }: { className?: string }) {
  return <img src={logo} alt="Lobsters" className={cn('h-auto w-full object-contain', className)} />;
}
