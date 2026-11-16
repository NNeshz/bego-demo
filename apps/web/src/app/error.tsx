"use client"; // Error boundaries must be Client Components

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";

// Next 16: the recovery callback is `retry` (re-fetches and re-renders the segment).
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <div className="glass flex flex-col items-center gap-4 px-6 py-10 text-center">
          <span className="text-4xl" aria-hidden>
            🛞
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-medium">Se nos ponchó una llanta</h1>
            <p className="text-sm text-muted-foreground">
              Algo falló de nuestro lado. Tus datos están bien; intenta otra vez en un momento.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => retry()}>
              <RotateCw /> Reintentar
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Inicio</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
