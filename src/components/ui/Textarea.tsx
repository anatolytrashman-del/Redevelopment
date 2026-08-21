import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className, rows = 4, ...props }: TextareaProps) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && <span className="text-sm text-ink-muted">{label}</span>}
      <textarea
        rows={rows}
        className={cn(
          // text-base, не text-sm — иначе iOS Safari зумит страницу при
          // фокусе (см. комментарий в Input.tsx).
          'w-full resize-y rounded-control border border-transparent bg-surface-muted px-4 py-3 text-base text-ink outline-none placeholder:text-ink-faint focus:border-primary sm:text-sm',
          className,
        )}
        {...props}
      />
    </label>
  );
}
