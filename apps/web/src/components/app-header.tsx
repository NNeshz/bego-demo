import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme";

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-md items-center justify-between gap-3 px-5 pt-5 md:max-w-5xl">
      <Link href="/" aria-label="Retorno, inicio" className="rounded-xl focus-visible:ring-2">
        <Logo />
      </Link>
      <div className="flex items-center gap-2">
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}
