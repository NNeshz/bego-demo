"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, type ReactNode } from "react";

/** Staggered entrance for lists. Respects prefers-reduced-motion via the global CSS rule. */
export function FadeIn({
  children,
  index = 0,
  className,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Money that counts up. The server always renders the final value (correct for
 * no-JS, screenshots and screen readers); only `animated` instances replay the
 * count on mount, which we reserve for the hero number above the fold.
 */
export function CountUp({
  value,
  format,
  animated = false,
  className,
}: {
  value: number;
  format: "money" | "signedMoney" | "km";
  animated?: boolean;
  className?: string;
}) {
  const motionValue = useMotionValue(value);
  const text = useTransform(motionValue, (latest) => FORMATTERS[format](latest));

  useEffect(() => {
    if (!animated) {
      motionValue.set(value);
      return;
    }
    motionValue.set(0);
    const controls = animate(motionValue, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [animated, motionValue, value]);

  return (
    <motion.span className={className} aria-label={FORMATTERS[format](value)}>
      {text}
    </motion.span>
  );
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
const int = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const FORMATTERS = {
  money: (v: number) => mxn.format(Math.round(v)),
  signedMoney: (v: number) => `${v >= 0 ? "+" : "−"}${mxn.format(Math.abs(Math.round(v)))}`,
  km: (v: number) => `${int.format(Math.round(v))} km`,
};
