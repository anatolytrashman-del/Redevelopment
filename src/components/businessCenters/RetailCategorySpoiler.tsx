// Обёртка CategorySpoiler для торговых разделов ТЦ: иконка и подпись
// из RETAIL_SECTION_*, чтобы карточки не дублировали шапку.
import type { ReactNode } from 'react';
import { CategorySpoiler } from '../ui/CategorySpoiler';
import { RETAIL_SECTION_LABELS, type RetailSectionId } from '../../lib/tradeCenterRetail';
import { RETAIL_SECTION_ICONS } from './tradeCenterRetailStyle';

export function RetailCategorySpoiler({
  id,
  label,
  subtitle,
  meta,
  index,
  defaultOpen = false,
  children,
}: {
  id: RetailSectionId;
  label?: string;
  subtitle?: string | null;
  meta?: string | null;
  index?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <CategorySpoiler
      id={id}
      title={label ?? RETAIL_SECTION_LABELS[id]}
      subtitle={subtitle}
      meta={meta}
      icon={RETAIL_SECTION_ICONS[id]}
      index={index}
      defaultOpen={defaultOpen}
    >
      {children}
    </CategorySpoiler>
  );
}
