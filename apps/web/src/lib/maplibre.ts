/** Shared MapLibre setup for every map in the app. Client-only (dynamic import). */

// OpenFreeMap: free vector tiles from OpenStreetMap data, no API key.
export const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

// MapLibre paint properties don't understand oklch() tokens: hex per theme.
export const MAP_COLORS = {
  light: {
    loaded: "#e8a919",
    empty: "#7c8494",
    home: "#9aa1ad",
    idle: "#b9bec7",
    corridor: "#f0702a",
    vehicle: "#12151b",
    halo: "#fffdeb",
  },
  dark: {
    loaded: "#f3e23f",
    empty: "#9aa3b2",
    home: "#6f7785",
    idle: "#4b5260",
    corridor: "#ff8b3e",
    vehicle: "#f3e23f",
    halo: "#0e1116",
  },
} as const;

export type MapTheme = keyof typeof MAP_STYLES;

/**
 * Loads MapLibre and points it at the worker we serve from public/vendor
 * (see scripts/copy-vendor.mjs): the bundled default worker URL doesn't exist.
 */
export async function loadMaplibre() {
  const maplibre = await import("maplibre-gl");
  maplibre.setWorkerUrl(`/vendor/maplibre-gl-worker-${maplibre.getVersion()}.mjs`);
  return maplibre;
}
