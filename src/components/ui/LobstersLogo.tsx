import { cn } from '../../lib/cn';

export function LobstersLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 340 46"
      className={cn('h-auto w-full', className)}
      role="img"
      aria-label="Lobsters"
    >
      <polygon points="14,0 340,0 326,46 0,46 18,23" fill="var(--color-primary)" />
      <text
        x="183"
        y="30"
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="var(--font-sans)"
        fontWeight="800"
        fontSize="23"
        letterSpacing="0.5"
      >
        LOBSTERS
      </text>
    </svg>
  );
}
