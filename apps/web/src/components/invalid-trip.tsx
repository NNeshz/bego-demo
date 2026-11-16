import { ArrowLeft, CircleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Shown when the trip in the URL is missing or malformed (old link, manual edit…). */
export function InvalidTrip() {
  return (
    <div className="glass flex flex-col items-center gap-4 px-6 py-10 text-center">
      <CircleAlert className="size-8 text-muted-foreground" />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-medium">Nos faltan datos de tu viaje</h1>
        <p className="text-sm text-muted-foreground">
          Este enlace está incompleto o ya no es válido. Cuéntanos otra vez dónde descargas.
        </p>
      </div>
      <Button asChild>
        <Link href="/">
          <ArrowLeft /> Empezar de nuevo
        </Link>
      </Button>
    </div>
  );
}
