"use client";

import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Client-side tabs: both lists are already server-rendered, switching is instant. */
export function ResultsTabs({
  tabs,
}: {
  tabs: Array<{ id: string; label: string; count: number; content: ReactNode }>;
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Tipo de recomendación"
        className="flex rounded-full border bg-card/60 p-1 backdrop-blur"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={cn(
              "relative flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
              active === tab.id ? "text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active === tab.id && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-full bg-foreground"
                transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}
              />
            )}
            <span className="relative">
              {tab.label} <span className="opacity-60">{tab.count}</span>
            </span>
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={active !== tab.id}
          className="flex flex-col gap-4"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
