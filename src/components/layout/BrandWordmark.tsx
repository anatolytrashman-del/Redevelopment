import { cn } from '../../lib/cn';
import { isLobstersBrand } from '../../lib/siteBrand';

type LogoSize = 'sm' | 'md' | 'lg';

const LOGO: Record<LogoSize, { base: string; w: number; h: number }> = {
  sm: { base: '/brand/lobsters/logo-sm', w: 192, h: 28 },
  md: { base: '/brand/lobsters/logo', w: 275, h: 40 },
  lg: { base: '/brand/lobsters/logo-lg', w: 659, h: 96 },
};

/** Логотип Lobsters (красная плашка), WebP/PNG 1x/2x. */
export function LobstersLogo({
  size = 'sm',
  height,
  className,
}: {
  size?: LogoSize;
  /** Высота в px (ширина по пропорции); по умолчанию — натуральная для size. */
  height?: number;
  className?: string;
}) {
  const l = LOGO[size];
  const h = height ?? l.h;
  const w = Math.round((l.w * h) / l.h);
  return (
    <picture className={cn('inline-block shrink-0 align-middle', className)}>
      <source type="image/webp" srcSet={`${l.base}.webp 1x, ${l.base}@2x.webp 2x`} />
      <img
        src={`${l.base}.png`}
        srcSet={`${l.base}.png 1x, ${l.base}@2x.png 2x`}
        width={w}
        height={h}
        alt="Lobsters"
        className="block h-auto max-w-full"
        style={{ height: h, width: 'auto' }}
        decoding="async"
      />
    </picture>
  );
}

/**
 * Логотип в шапке админки: на lobsters.pro — картинка Lobsters, иначе прежний
 * текстовый «RED»EVELOPMENT (та же разметка, что была во всех местах).
 */
export function BrandWordmark({
  className,
  lobstersHeight = 28,
}: {
  className?: string;
  lobstersHeight?: number;
}) {
  if (isLobstersBrand()) {
    return <LobstersLogo size={lobstersHeight > 32 ? 'md' : 'sm'} height={lobstersHeight} />;
  }
  return (
    <span className={className}>
      <span className="font-black text-primary">RED</span>EVELOPMENT
    </span>
  );
}
