import { cn } from "@/lib/utils";

/**
 * Soft layered hills that read as "road ahead". Pure SVG + CSS (no images),
 * themed through the --terrain-* tokens and gently drifting.
 */
export function Terrain({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden", className)}
    >
      <svg
        viewBox="0 0 1440 420"
        preserveAspectRatio="none"
        className="relative block h-full w-[112%] -translate-x-[6%]"
      >
        <defs>
          <linearGradient id="terrain-a" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--terrain-1)" />
            <stop offset="1" stopColor="var(--terrain-2)" />
          </linearGradient>
          <linearGradient id="terrain-b" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--terrain-2)" />
            <stop offset="0.6" stopColor="var(--terrain-3)" />
            <stop offset="1" stopColor="var(--terrain-2)" />
          </linearGradient>
          <filter id="terrain-blur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g filter="url(#terrain-blur)">
          <path
            className="animate-drift-slow origin-bottom"
            fill="url(#terrain-a)"
            opacity="0.75"
            d="M0 210 C120 150 210 120 330 170 S540 90 660 140 860 60 990 130 1220 110 1320 150 1440 140 1440 140 V420 H0Z"
          />
          <path
            className="animate-drift origin-bottom"
            fill="url(#terrain-b)"
            d="M0 290 C140 230 260 250 380 210 S600 260 720 220 900 170 1040 230 1260 200 1440 240 V420 H0Z"
          />
          <path
            className="animate-drift-slow origin-bottom"
            fill="var(--terrain-3)"
            opacity="0.55"
            d="M0 360 C180 320 320 340 500 310 S820 350 980 320 1260 300 1440 330 V420 H0Z"
          />
        </g>
      </svg>
    </div>
  );
}
