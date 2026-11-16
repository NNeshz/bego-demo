import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme";
import { cn } from "@/lib/utils";

export function AppHeader({ children, wide = false }: { children?: ReactNode; wide?: boolean }) {
  return (
    <header
      className={cn(
        "relative z-10 mx-auto flex w-full items-center justify-between gap-3 px-5 pt-5",
        wide ? "max-w-7xl" : "max-w-md md:max-w-5xl",
      )}
    >
      <Link href="/" aria-label="Retorno, inicio" className="rounded-xl focus-visible:ring-2">
        <Logo />
      </Link>
      <div className="flex items-center gap-2">
        {children}
        <Link
          href="/despacho"
          className="inline-flex h-10 items-center gap-2 rounded-full border bg-card/60 px-3.5 text-sm backdrop-blur transition hover:bg-accent"
        >
          <LayoutDashboard className="size-4" />
          <span className="hidden sm:inline">Despacho</span>
          <span className="sr-only sm:hidden">Vista de despachador</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
