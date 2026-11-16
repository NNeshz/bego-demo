import { ArrowLeft, PackageX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Cargando detalle">
      <div className="h-5 w-36 animate-pulse rounded-full bg-muted" />
      <div className="h-9 w-64 animate-pulse rounded-full bg-muted" />
      <div className="h-12 w-48 animate-pulse rounded-full bg-muted" />
      <div className="h-72 animate-pulse rounded-3xl bg-muted" />
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="glass h-80 animate-pulse" />
    </div>
  );
}

/** The load was taken, its window closed, or the link is from another day. */
export function LoadGone({ backHref }: { backHref: string }) {
  return (
    <div className="glass mt-6 flex flex-col items-center gap-4 px-6 py-10 text-center">
      <PackageX className="size-8 text-muted-foreground" />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-medium">Esta carga ya no está disponible</h1>
        <p className="text-sm text-muted-foreground">
          Ya la tomó alguien más o su horario de recolección ya no te da. Mira las opciones de
          ahorita.
        </p>
      </div>
      <Button asChild>
        <Link href={backHref}>
          <ArrowLeft /> Ver opciones actuales
        </Link>
      </Button>
    </div>
  );
}
