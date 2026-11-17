import type { WeightsSource } from "@/server/learned-weights";

/** Spanish labels for the simulated trucker types (services/ml/simulator.py). */
export const PERSONA_LABELS: Record<string, string> = {
  casa: "Quiere volver a su base",
  espera: "No soporta esperar",
  dinero: "Solo ve la ganancia",
};

export function weightsSourceLabel(source: WeightsSource): string {
  switch (source.kind) {
    case "learned":
      return source.scope === "trucker"
        ? `Orden personalizado con lo que este transportista acepta y rechaza · modelo v${source.version}`
        : `Pesos aprendidos de todos los transportistas · modelo v${source.version}`;
    case "request":
      return "Pesos indicados en la petición";
    case "default":
      return source.reason === "no_model"
        ? "Pesos fijos: todavía no hay un modelo que les gane"
        : "Pesos fijos del motor";
  }
}
