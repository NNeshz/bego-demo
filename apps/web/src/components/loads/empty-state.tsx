import { CalendarClock, Truck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export interface RejectionStats {
  evaluated: number;
  feasible: number;
  rejected: {
    incompatible_unit: number;
    too_far: number;
    window_missed: number;
    not_worth_it: number;
  };
}

/** Explains WHY there is nothing, using the engine's rejection counts, and what to try next. */
export function EmptyState({
  stats,
  unitLabel,
  cityName,
  editHref,
}: {
  stats: RejectionStats;
  unitLabel: string;
  cityName: string;
  editHref: string;
}) {
  const { rejected, evaluated } = stats;
  const compatible = evaluated - rejected.incompatible_unit;

  let title = "No hay cargas compatibles";
  let body =
    "Prueba ampliar tu ventana: quedar libre unas horas antes o después cambia mucho las opciones.";
  if (compatible === 0) {
    title = `No hay cargas para ${unitLabel} hoy`;
    body =
      "Ninguna carga del mercado pide tu tipo de unidad. Si puedes mover otra unidad, cámbiala y vuelve a buscar.";
  } else if (rejected.not_worth_it > 0 && rejected.not_worth_it >= rejected.window_missed) {
    title = "Hoy conviene regresar vacío";
    body = `Hay ${rejected.not_worth_it} cargas posibles, pero ninguna te deja más dinero que regresar directo a tu base.`;
  } else if (rejected.window_missed >= rejected.too_far) {
    title = "Las cargas cercanas ya cerraron";
    body = `Las ${rejected.window_missed} cargas a tu alcance tienen horario de recolección que no alcanzas. Prueba con otra hora.`;
  } else {
    title = `No hay cargas cerca de ${cityName}`;
    body = "Todas las cargas compatibles están a más de 450 km de donde descargas.";
  }

  return (
    <div className="glass flex flex-col items-center gap-4 px-6 py-10 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-secondary">
        <Truck className="size-7 text-muted-foreground" />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-medium">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <Button asChild variant="outline">
        <Link href={editHref}>
          <CalendarClock /> Cambiar hora o unidad
        </Link>
      </Button>
    </div>
  );
}
