"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      {label && <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>}
      <pre
        tabIndex={0}
        aria-label={label ?? "Código"}
        className="overflow-x-auto rounded-xl bg-foreground py-2.5 pr-12 pl-3 text-[11px] leading-relaxed text-background"
      >
        <code>{code}</code>
      </pre>
      <button
        type="button"
        aria-label="Copiar"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-lg bg-background/15 text-background hover:bg-background/25"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
