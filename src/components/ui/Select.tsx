import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

interface SelectProps {
  label?: string;
  placeholder?: string;
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
  pill?: boolean;
}

export function Select({ label, placeholder = 'Выберите значение', options, value, onChange, pill }: SelectProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex flex-col gap-1.5">
      {label && <span className="text-sm text-ink-muted">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center justify-between gap-3 border bg-surface-muted px-4 py-2.5 text-sm outline-none',
          pill ? 'rounded-full border-border' : 'rounded-control border-transparent',
          value ? 'text-ink' : 'text-ink-faint',
        )}
      >
        {value || placeholder}
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-control border border-border bg-surface-muted shadow-card">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange?.(option);
                setOpen(false);
              }}
              className="block w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-surface"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
