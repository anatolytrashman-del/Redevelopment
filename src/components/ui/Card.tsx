import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';

// Общая "жидкое стекло" поверхность — та же вёрстка, что и на продающей
// странице (см. lib/glass.ts), но теперь это дефолт для всей админки, а
// не опциональный проп: раньше только публичные страницы включали стекло
// через glass?: boolean на компонентах-обёртках, здесь смысла в двух видах
// карточек нет — админка целиком переведена на единый стиль.
export function Card({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(glassCardClass, 'p-6', className)}
      style={{ ...glassCardShadow, ...style }}
      {...props}
    />
  );
}
