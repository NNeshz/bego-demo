import { cn } from "@/lib/utils";

/** Own mark: a U-turn ("go out, come back loaded"). Deliberately unlike BeGo's hexagon. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" className="fill-foreground" />
      <path
        d="M10 24V14.5a6 6 0 0 1 12 0V20"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-brand"
      />
      <path
        d="M18 18.5l4 4 4-4"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-brand"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-sm font-medium tracking-[0.22em] uppercase">Retorno</span>
    </span>
  );
}
