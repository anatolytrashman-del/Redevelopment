import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';

export interface TreeRow {
  id: string;
  label: string;
  count?: number;
  inProgress: number;
  confirmed: number;
  rejected: number;
  earned: string;
  children?: TreeRow[];
}

interface TreeTableProps {
  columns: string[];
  rows: TreeRow[];
  totalRow: Omit<TreeRow, 'id' | 'label' | 'children'> & { label: string };
}

function Row({ row, depth }: { row: TreeRow; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = !!row.children?.length;

  return (
    <>
      <div
        className={cn(
          'grid grid-cols-[1fr_repeat(4,minmax(90px,auto))] items-center gap-4 border-b border-border px-6 py-4 text-sm',
          depth > 0 && 'bg-black/[0.025]',
        )}
      >
        <button
          type="button"
          onClick={() => hasChildren && setOpen((v) => !v)}
          className="flex items-center gap-2 text-left font-medium text-ink"
          style={{ paddingLeft: depth * 20 }}
        >
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border',
              !hasChildren && 'invisible',
            )}
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
          {row.label}
          {row.count !== undefined && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-muted px-1 text-xs text-ink-muted">
              {row.count}
            </span>
          )}
        </button>
        <span className="text-right text-ink-muted">{row.inProgress}</span>
        <span className="text-right text-ink-muted">{row.confirmed}</span>
        <span className="text-right text-ink-muted">{row.rejected}</span>
        <span className="text-right font-semibold text-ink">{row.earned}</span>
      </div>
      {open && row.children?.map((child) => <Row key={child.id} row={child} depth={depth + 1} />)}
    </>
  );
}

export function TreeTable({ columns, rows, totalRow }: TreeTableProps) {
  return (
    <div className={cn('overflow-hidden', glassCardClass)} style={glassCardShadow}>
      <div className="grid grid-cols-[1fr_repeat(4,minmax(90px,auto))] gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
        {columns.map((col, i) => (
          <span key={col} className={i > 0 ? 'text-right' : ''}>
            {col}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <Row key={row.id} row={row} depth={0} />
      ))}
      <div className="grid grid-cols-[1fr_repeat(4,minmax(90px,auto))] items-center gap-4 bg-primary-soft px-6 py-4 text-sm font-semibold text-ink">
        <span>{totalRow.label}</span>
        <span className="text-right">{totalRow.inProgress}</span>
        <span className="text-right">{totalRow.confirmed}</span>
        <span className="text-right">{totalRow.rejected}</span>
        <span className="text-right">{totalRow.earned}</span>
      </div>
    </div>
  );
}
