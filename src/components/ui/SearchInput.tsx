import type { InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';

export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink-faint focus-within:border-primary">
      <Search className="h-4 w-4 shrink-0" />
      <input
        className={cn('w-full bg-transparent text-ink outline-none placeholder:text-ink-faint', className)}
        {...props}
      />
    </span>
  );
}
