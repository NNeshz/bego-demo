"use client";

import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RetrainForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "error"; message?: string }>({
    kind: "idle",
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState({ kind: "busy" });
    try {
      const response = await fetch("/api/ml/train", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "No se pudo reentrenar.");
      setState({
        kind: "ok",
        message: body.published
          ? `Modelo v${body.version} entrenado y publicado.`
          : `Modelo v${body.version} entrenado, pero NO se publicó: no le ganó a los pesos fijos.`,
      });
      setToken("");
      router.refresh();
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Error" });
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label
        htmlFor="admin-token"
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <KeyRound className="size-3.5" /> Token de admin (ML_ADMIN_TOKEN)
      </label>
      <div className="flex gap-2">
        <input
          id="admin-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="control flex-1"
        />
        <Button type="submit" variant="outline" disabled={!token || state.kind === "busy"}>
          {state.kind === "busy" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Reentrenar
        </Button>
      </div>
      {state.message && (
        <p
          role="status"
          className={state.kind === "error" ? "text-sm text-destructive" : "text-sm text-money"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
