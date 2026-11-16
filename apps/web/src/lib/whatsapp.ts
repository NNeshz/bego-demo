import { UNIT_LABELS, type Load, type UnitType } from "@retorno/engine";
import { money, tons, when } from "./format";

/** Ready-to-send message for the shipper. Opens WhatsApp's contact picker (wa.me without a number). */
export function whatsappLink(loads: Load[], unitType: UnitType, pickupArrivals: string[]): string {
  const lines = loads.map(
    (load, i) =>
      `• ${load.id}: ${load.origin.name} → ${load.destination.name}, ${load.commodity}, ${tons(load.weightKg)}. ` +
      `Puedo recoger ${when(pickupArrivals[i]!)}. Tarifa publicada: ${money(load.rateMxn)}.`,
  );
  const intro =
    loads.length > 1
      ? "Hola, me interesan estas cargas que vi en Retorno:"
      : "Hola, me interesa esta carga que vi en Retorno:";
  const question = loads.length > 1 ? "¿Siguen disponibles?" : "¿Sigue disponible?";
  const text = [intro, ...lines, `Traigo ${UNIT_LABELS[unitType]}. ${question}`].join("\n");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
