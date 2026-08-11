import type { InputHTMLAttributes } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  state?: 'default' | 'success' | 'error';
  helperText?: string;
}

const stateBorder: Record<NonNullable<InputProps['state']>, string> = {
  default: 'border-transparent focus:border-primary',
  success: 'border-success',
  error: 'border-danger',
};

export function Input({ label, state = 'default', helperText, className, ...props }: InputProps) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && <span className="text-sm text-ink-muted">{label}</span>}
      <span className="relative flex items-center">
        <input
          className={cn(
            'w-full rounded-control border bg-surface-muted px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-faint',
            stateBorder[state],
            className,
          )}
          {...props}
        />
        {state === 'success' && <Check className="absolute right-4 h-4 w-4 text-success" />}
        {state === 'error' && <X className="absolute right-4 h-4 w-4 text-danger" />}
      </span>
      {helperText && (
        <span className={cn('text-xs', state === 'error' ? 'text-danger' : 'text-ink-muted')}>
          {helperText}
        </span>
      )}
    </label>
  );
}
