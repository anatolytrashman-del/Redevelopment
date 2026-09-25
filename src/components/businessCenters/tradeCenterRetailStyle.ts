// Иконки разделов и рамка торговых карточек ТЦ — отдельно от компонентов
// (TradeCenterRetailParts.tsx), чтобы файл с компонентами экспортировал
// только компоненты (react/only-export-components). Иконки нужны и странице
// — для пунктов меню «На странице».
import {
  Anchor,
  BarChart3,
  Briefcase,
  Clapperboard,
  FerrisWheel,
  Flag,
  Layers,
  MessageSquareQuote,
  Signpost,
  Gift,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass } from '../../lib/glass';
import type { RetailSectionId } from '../../lib/tradeCenterRetail';

export const RETAIL_SECTION_ICONS: Record<RetailSectionId, LucideIcon> = {
  floors: Layers,
  'retail-history': Flag,
  food: UtensilsCrossed,
  fun: FerrisWheel,
  leisure: Clapperboard,
  'getting-here': Signpost,
  'offers-events': Gift,
  business: Briefcase,
  numbers: BarChart3,
  quotes: MessageSquareQuote,
  anchors: Anchor,
};

export const retailCardClass = cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass);
