import { cn } from '../../lib/cn';

export function LobsterMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 500 640"
      fill="none"
      className={cn('text-mascot', className)}
      aria-hidden="true"
    >
      <g
        stroke="currentColor"
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(2px 10px 10px rgb(255 122 118 / 0.35))' }}
      >
        {/* large antenna curl */}
        <path d="M215 55c-34-18-70-6-82 26-11 30 4 58 30 66 22 7 42-5 46-24" />
        {/* small antenna curl */}
        <path d="M290 95c17-9 36-2 40 15 4 15-6 28-20 27" />
        {/* flowing line from antennae down to claw */}
        <path d="M300 130c34 20 55 40 60 72" />
        {/* claw */}
        <path d="M360 202c22-4 42 8 44 30 2 20-14 34-32 30-14-3-20-15-16-27" />
        {/* body diagonal from claw down to head */}
        <path d="M348 235c-46 46-104 96-160 138" />
        {/* head / shell capsule */}
        <path
          d="M188 373c-28 20-30 60-4 78 24 17 56 6 64-22 8-27-9-54-32-58-8-2-18 0-28 2z"
          strokeWidth="18"
        />
        {/* legs */}
        <path d="M150 420l-46 34" />
        <path d="M138 452l-48 30" />
        <path d="M128 484l-50 26" />
        <path d="M120 516l-52 22" />
        {/* foot curl */}
        <path d="M64 540c-24 8-34 30-24 50 10 19 34 24 50 12" />
      </g>
    </svg>
  );
}
