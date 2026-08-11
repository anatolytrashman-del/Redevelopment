import { cn } from '../../lib/cn';

export function LobsterMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 140 140"
      fill="none"
      className={cn('text-primary', className)}
      aria-hidden="true"
    >
      {/* tail */}
      <path
        d="M70 132c-10-6-16-15-16-26 0-9 5-15 5-23"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path d="M62 118c3 3 8 4 12 2" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M60 106c3 3 8 4 12 2" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      {/* body */}
      <ellipse cx="63" cy="72" rx="16" ry="20" stroke="currentColor" strokeWidth="3.5" />
      {/* head + antennae */}
      <path d="M55 54c-10-14-8-28 2-36" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M63 52c-4-16 2-30 14-36" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      {/* left claw */}
      <path
        d="M49 66c-16-4-28 2-34 14-3 6-1 12 5 14 7 3 14-2 16-9"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 80c-5 4-7 10-4 16" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      {/* right claw */}
      <path
        d="M78 62c16 0 27 9 30 22 1 7-3 12-9 13-7 2-13-4-14-11"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M108 84c6 3 9 9 7 15" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      {/* legs */}
      <path d="M52 90c-8 4-13 10-14 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M74 90c8 4 13 10 14 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
