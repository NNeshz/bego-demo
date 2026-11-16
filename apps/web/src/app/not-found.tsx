import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Terrain } from "@/components/brand/terrain";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="relative flex min-h-[calc(100dvh-28px)] flex-1 flex-col overflow-hidden">
      <Terrain className="h-[40vh]" />
      <AppHeader />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-5 pb-24">
        <span className="eyebrow">Error 404</span>
        <h1 className="text-4xl font-light tracking-tight">Esta ruta no existe.</h1>
        <p className="text-muted-foreground">
          Tomaste una desviación. Regresa a la carretera principal.
        </p>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/">
            <ArrowLeft /> Volver al inicio
          </Link>
        </Button>
      </main>
    </div>
  );
}
