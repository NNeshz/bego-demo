/** Copy-paste integration snippets, parameterized with the deployment origin. */
export function snippets(origin: string) {
  return {
    html: `<script src="${origin}/widget.js" defer></script>

<retorno-widget
  position="nuevo-laredo"
  base="queretaro"
  unit-type="dry_van_53"
  explain
></retorno-widget>

<script>
  document.querySelector("retorno-widget")
    .addEventListener("retorno-accept", (event) => {
      const { recommendation, rank } = event.detail;
      // Book it in your own system
      console.log("Accepted", recommendation.load.id, rank);
    });
</script>`,

    react: `// Load once, e.g. in index.html or app/layout.tsx:
// <script src="${origin}/widget.js" defer></script>
import { useEffect, useRef } from "react";

export function ReturnLoads({ trip, onAccept }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    const handler = (e: Event) => onAccept((e as CustomEvent).detail);
    el?.addEventListener("retorno-accept", handler);
    return () => el?.removeEventListener("retorno-accept", handler);
  }, [onAccept]);

  return (
    <retorno-widget
      ref={ref}
      position={trip.unloadCity}
      base={trip.homeBase}
      unit-type={trip.unitType}
      theme="auto"
    />
  );
}`,

    angular: `// index.html (or angular.json "scripts"):
// <script src="${origin}/widget.js" defer></script>
import { Component, CUSTOM_ELEMENTS_SCHEMA, Input } from "@angular/core";

@Component({
  selector: "app-return-loads",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: \`
    <retorno-widget
      [attr.position]="trip.unloadCity"
      [attr.base]="trip.homeBase"
      [attr.unit-type]="trip.unitType"
      (retorno-accept)="book($any($event).detail)">
    </retorno-widget>
  \`,
})
export class ReturnLoadsComponent {
  @Input({ required: true }) trip!: { unloadCity: string; homeBase: string; unitType: string };

  book(detail: { recommendation: { load: { id: string } }; rank: number }) {
    // Call your booking service
  }
}`,
  };
}

export const ATTRIBUTES: Array<[string, string]> = [
  ["position", "Ciudad donde descarga (id de GET /api/v1/cities)"],
  ["base", "Ciudad a la que quiere regresar"],
  ["unit-type", "dry_van_53 · reefer_53 · flatbed_48 · full_double · torton"],
  ["available-at", "ISO-8601. Por defecto: ahora"],
  ["limit", "1–10 recomendaciones (default 3)"],
  ["explain", "Agrega la frase “Te conviene porque…” (IA)"],
  ["theme", "light · dark · auto (sigue al sistema)"],
  ["api-base", "Por defecto, el dominio que sirvió widget.js"],
  ["no-feedback", "No registrar aceptar/rechazar en /api/v1/events"],
];

export const EVENTS: Array<[string, string]> = [
  ["retorno-load", "{ count, trip }"],
  ["retorno-accept", "{ recommendation, rank, trip } · cancelable"],
  ["retorno-reject", "{ recommendation, rank, trip }"],
  ["retorno-error", "{ message, status? }"],
];

export const CSS_VARS = [
  "--retorno-accent",
  "--retorno-accent-fg",
  "--retorno-font",
  "--retorno-radius",
  "--retorno-bg",
  "--retorno-card",
  "--retorno-fg",
  "--retorno-muted",
  "--retorno-border",
];
