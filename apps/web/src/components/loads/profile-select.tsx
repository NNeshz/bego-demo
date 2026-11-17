"use client";

import { Sparkles, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

export interface ProfileOption {
  truckId: string;
  label: string;
}

/**
 * Demo of personalization without accounts: pick a simulated trucker and the same
 * market is re-ranked with the weights learned from THEIR accept/reject history.
 */
export function ProfileSelect({
  options,
  current,
  baseQuery,
  sourceLabel,
}: {
  options: ProfileOption[];
  current: string | undefined;
  /** Trip query WITHOUT the `t` param. */
  baseQuery: string;
  sourceLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card/60 px-4 py-3 backdrop-blur">
      <label htmlFor="profile" className="flex items-center gap-2 text-xs text-muted-foreground">
        <UserRound className="size-3.5" /> Ordenar para
      </label>
      <select
        id="profile"
        value={current ?? ""}
        disabled={pending}
        onChange={(event) => {
          const t = event.target.value;
          startTransition(() =>
            router.push(`/cargas?${baseQuery}${t ? `&t=${encodeURIComponent(t)}` : ""}`),
          );
        }}
        className={cn("control", pending && "opacity-60")}
      >
        <option value="">Cualquier transportista</option>
        {options.map((option) => (
          <option key={option.truckId} value={option.truckId}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Sparkles className="size-3" /> {pending ? "Reordenando…" : sourceLabel}
      </span>
    </div>
  );
}
