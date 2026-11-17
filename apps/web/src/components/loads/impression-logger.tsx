"use client";

import { useEffect } from "react";

export interface ShownEvent {
  action: "shown";
  loadIds: string[];
  rank: number;
  scorePerHour: number;
  gainVsEmptyMxn: number;
  features: Record<string, number>;
  decisionId: string;
  policy: string;
  source: "app";
  truckId?: string | undefined;
}

/** Survives React StrictMode's double effect in dev: each decision is logged once per page load. */
const logged = new Set<string>();

/**
 * Logs every option shown on screen as one decision. These "shown" events are
 * the model's negatives: what the trucker saw and didn't take.
 */
export function ImpressionLogger({ events }: { events: ShownEvent[] }) {
  useEffect(() => {
    const decisionId = events[0]?.decisionId;
    if (!decisionId || logged.has(decisionId)) return;
    logged.add(decisionId);
    void fetch("/api/v1/events/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // No keepalive: the page isn't unloading here (keepalive is for accept/reject, which may navigate away).
      body: JSON.stringify({ events }),
    })
      // Discard the body: an unread response keeps the request open until garbage collection.
      .then((response) => response.body?.cancel())
      .catch(() => {
        // Feedback is best-effort: never break the trucker's screen over analytics.
      });
  }, [events]);
  return null;
}
