"use client";

import { Check, MessageCircle, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface FeedbackPayload {
  loadIds: string[];
  rank: number;
  scorePerHour: number;
  gainVsEmptyMxn: number;
  features: Record<string, number>;
  /** Joins this feedback to the "shown" events of the screen it came from. */
  decisionId?: string | undefined;
  policy: string;
  source: "app";
  truckId?: string | undefined;
}

/** Fire-and-forget feedback event; `keepalive` lets it finish even if the page navigates away. */
function sendEvent(action: "accepted" | "rejected", payload: FeedbackPayload) {
  void fetch("/api/v1/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
    keepalive: true,
  })
    // Discard the body: an unread response keeps the request open until garbage collection.
    .then((response) => response.body?.cancel())
    .catch(() => {});
}

export function AcceptActions({
  whatsappHref,
  payload,
  backHref,
}: {
  whatsappHref: string;
  payload: FeedbackPayload;
  backHref: string;
}) {
  const [state, setState] = useState<"idle" | "accepted" | "rejected">("idle");

  return (
    <div className="sticky bottom-0 z-20 -mx-5 mt-2 border-t bg-background/85 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
      {state === "rejected" ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Gracias, lo tomamos en cuenta para tus próximas recomendaciones.
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href={backHref}>Ver otras</Link>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button asChild variant="brand" size="lg" className="flex-1">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                sendEvent("accepted", payload);
                setState("accepted");
              }}
            >
              {state === "accepted" ? <Check /> : <MessageCircle />}
              {state === "accepted" ? "Mensaje listo en WhatsApp" : "Aceptar por WhatsApp"}
            </a>
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="No me interesa"
            title="No me interesa"
            className="size-14"
            onClick={() => {
              sendEvent("rejected", payload);
              setState("rejected");
            }}
          >
            <ThumbsDown />
          </Button>
        </div>
      )}
    </div>
  );
}
