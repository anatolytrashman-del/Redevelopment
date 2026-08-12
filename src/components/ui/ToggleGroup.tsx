import { cn } from '../../lib/cn';

interface ToggleGroupProps {
  label?: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

export function ToggleGroup({ label, options, value, onChange }: ToggleGroupProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm text-ink-muted">{label}</span>}
      <div className="flex w-fit gap-1 rounded-full border border-border bg-surface-muted p-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              value === option ? 'bg-surface text-primary shadow-card' : 'text-ink-muted',
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
