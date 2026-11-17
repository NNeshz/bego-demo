"use client";

import { Moon, Sun } from "lucide-react";
import { MotionConfig } from "motion/react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import type { ReactNode } from "react";

/**
 * System preference by default; truckers driving at night get dark mode automatically.
 * Motion animations follow the OS "reduce motion" setting too (the CSS rule in globals.css
 * only covers CSS animations, not JS-driven ones).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </NextThemes>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      // The theme is unknown on the server: a theme-dependent label would cause a hydration mismatch.
      aria-label="Cambiar entre modo claro y oscuro"
      className="grid size-10 place-items-center rounded-full border bg-card/60 backdrop-blur transition hover:bg-accent"
    >
      {/* Both icons render; CSS picks one, so server and client markup match. */}
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </button>
  );
}
