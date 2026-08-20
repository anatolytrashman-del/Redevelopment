import { cn } from '../../lib/cn';

// Знак белорусского рубля (Б с горизонтальной перекладиной) — у него нет
// кодовой точки в Юникоде, поэтому не символ, а inline-SVG, нарисованный по
// референсу пользователя. currentColor — наследует цвет текста; размер
// задаётся от кегля через h-[0.8em].
export function BynSign({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 84 118"
      aria-label="BYN"
      role="img"
      className={cn('inline-block h-[0.8em] w-auto -translate-y-[0.05em] align-middle', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="14"
    >
      {/* Верхняя перекладина + стойка */}
      <path d="M80 7 H21 V111" />
      {/* Чаша: от стойки вправо, полукругом вниз обратно к стойке */}
      <path d="M21 47 H45 A28.5 28.5 0 0 1 45 104 H21" />
      {/* Перекладина-крест — выходит влево сквозь стойку */}
      <path d="M0 69 H49" />
    </svg>
  );
}
