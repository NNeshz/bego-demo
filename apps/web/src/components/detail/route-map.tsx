"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface MapPoint {
  lat: number;
  lng: number;
  name: string;
}
export interface MapStop {
  kind: "truck" | "pickup" | "delivery" | "base";
  point: MapPoint;
  label: string;
}
export interface MapSegment {
  kind: "empty" | "loaded" | "home";
  from: MapPoint;
  to: MapPoint;
}

// OpenFreeMap: free vector tiles from OpenStreetMap data, no API key.
const STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
// MapLibre paint properties don't understand oklch() tokens: use hex per theme.
const COLORS = {
  light: {
    loaded: "#e8a919",
    empty: "#7c8494",
    home: "#9aa1ad",
    vehicle: "#12151b",
    halo: "#fffdeb",
  },
  dark: {
    loaded: "#f3e23f",
    empty: "#9aa3b2",
    home: "#6f7785",
    vehicle: "#f3e23f",
    halo: "#0e1116",
  },
};

const ARC_POINTS = 48;
const LOOP_MS = 7_000;

/** A gentle curve between two points so legs that overlap stay readable. Not the real road. */
function arc(from: MapPoint, to: MapPoint): [number, number][] {
  const dx = to.lng - from.lng;
  const dy = to.lat - from.lat;
  const bend = 0.12;
  const cx = (from.lng + to.lng) / 2 - dy * bend;
  const cy = (from.lat + to.lat) / 2 + dx * bend;
  return Array.from({ length: ARC_POINTS + 1 }, (_, i) => {
    const t = i / ARC_POINTS;
    const u = 1 - t;
    return [
      u * u * from.lng + 2 * u * t * cx + t * t * to.lng,
      u * u * from.lat + 2 * u * t * cy + t * t * to.lat,
    ];
  });
}

function routeData(segments: MapSegment[]) {
  return {
    type: "FeatureCollection" as const,
    features: segments
      .filter((s) => s.from.lat !== s.to.lat || s.from.lng !== s.to.lng)
      .map((s) => ({
        type: "Feature" as const,
        properties: { kind: s.kind },
        geometry: { type: "LineString" as const, coordinates: arc(s.from, s.to) },
      })),
  };
}

export function RouteMap({
  stops,
  segments,
  className,
}: {
  stops: MapStop[];
  segments: MapSegment[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    const markers: Marker[] = [];

    void (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      // Served from public/vendor (see scripts/copy-vendor.mjs): the bundled default URL doesn't exist.
      maplibre.setWorkerUrl(`/vendor/maplibre-gl-worker-${maplibre.getVersion()}.mjs`);

      let map: MapLibreMap;
      try {
        map = new maplibre.Map({
          container: containerRef.current,
          style: STYLES[theme],
          center: [stops[0]?.point.lng ?? -100, stops[0]?.point.lat ?? 23],
          zoom: 4,
          attributionControl: { compact: true },
          // One-finger scroll keeps scrolling the page on phones; two fingers move the map.
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
        });
      } catch {
        setFailed(true); // e.g. WebGL unavailable
        return;
      }
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();

      const bounds = new maplibre.LngLatBounds();
      for (const stop of stops) bounds.extend([stop.point.lng, stop.point.lat]);
      map.fitBounds(bounds, {
        padding: { top: 56, bottom: 56, left: 56, right: 56 },
        duration: 0,
        maxZoom: 7,
      });

      for (const stop of stops) {
        markers.push(
          new maplibre.Marker({ element: markerElement(stop), anchor: "center" })
            .setLngLat([stop.point.lng, stop.point.lat])
            .addTo(map),
        );
      }

      const path = segments.flatMap((s) => arc(s.from, s.to));
      map.on("load", () => {
        addRouteLayers(map, segments, theme);
        // Start with the attribution collapsed to the (i) button; it stays one tap away.
        containerRef.current
          ?.querySelector(".maplibregl-ctrl-attrib")
          ?.classList.remove("maplibregl-compact-show");
        // Animated vehicle along the whole route.
        const start = performance.now();
        const tick = (now: number) => {
          const source = map.getSource("vehicle") as GeoJSONSource | undefined;
          if (source && path.length > 0) {
            const t = ((now - start) % LOOP_MS) / LOOP_MS;
            const point = path[Math.min(path.length - 1, Math.floor(t * path.length))]!;
            source.setData({
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: point },
            });
          }
          frame = requestAnimationFrame(tick);
        };
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
          frame = requestAnimationFrame(tick);
      });
      map.on("error", () => {
        // Tile/network errors are non-fatal; the route layers still render.
      });
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      markers.forEach((m) => m.remove());
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Rebuild only when the route changes; theme changes swap the style below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(stops), JSON.stringify(segments)]);

  // Theme switch: swap basemap style, then re-add our layers on top of it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(STYLES[theme]);
    map.once("style.load", () => addRouteLayers(map, segments, theme));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  if (failed) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-3xl border bg-muted p-6 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        No pudimos cargar el mapa en este dispositivo.
      </div>
    );
  }

  return (
    <figure className="flex flex-col gap-2">
      <div className={cn("relative overflow-hidden rounded-3xl border", className)}>
        {/* h-full, not absolute inset-0: MapLibre adds `.maplibregl-map { position: relative }`, which would collapse it to 0px. */}
        <div ref={containerRef} className="h-full w-full" aria-label="Mapa de la ruta" role="img" />
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-muted-foreground">
        <Legend swatch="border-t-2 border-dashed border-deadhead" label="En vacío" />
        <Legend swatch="border-t-[3px] border-loaded" label="Cargado" />
        <Legend swatch="border-t-2 border-dotted border-deadhead/70" label="A tu base" />
        <span>● descargas · A recoges · B entregas · ⌂ tu base</span>
        <span className="w-full">Trazo aproximado en línea recta, no es la carretera real.</span>
      </figcaption>
    </figure>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("w-5", swatch)} />
      {label}
    </span>
  );
}

function addRouteLayers(map: MapLibreMap, segments: MapSegment[], theme: "light" | "dark") {
  const colors = COLORS[theme];
  if (map.getSource("route")) return;
  map.addSource("route", { type: "geojson", data: routeData(segments) });
  map.addSource("vehicle", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "route-home",
    type: "line",
    source: "route",
    filter: ["==", ["get", "kind"], "home"],
    layout: { "line-cap": "round" },
    paint: { "line-color": colors.home, "line-width": 2, "line-dasharray": [0.5, 2] },
  });
  map.addLayer({
    id: "route-empty",
    type: "line",
    source: "route",
    filter: ["==", ["get", "kind"], "empty"],
    paint: { "line-color": colors.empty, "line-width": 3, "line-dasharray": [2, 1.5] },
  });
  map.addLayer({
    id: "route-loaded-glow",
    type: "line",
    source: "route",
    filter: ["==", ["get", "kind"], "loaded"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.loaded, "line-width": 10, "line-opacity": 0.25, "line-blur": 4 },
  });
  map.addLayer({
    id: "route-loaded",
    type: "line",
    source: "route",
    filter: ["==", ["get", "kind"], "loaded"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.loaded, "line-width": 4 },
  });
  map.addLayer({
    id: "vehicle",
    type: "circle",
    source: "vehicle",
    paint: {
      "circle-radius": 7,
      "circle-color": colors.vehicle,
      "circle-stroke-width": 3,
      "circle-stroke-color": colors.halo,
    },
  });
}

const STOP_STYLE: Record<MapStop["kind"], { bg: string; glyph: string }> = {
  truck: { bg: "bg-foreground text-background", glyph: "●" },
  pickup: { bg: "bg-brand text-brand-foreground", glyph: "A" },
  delivery: { bg: "bg-brand text-brand-foreground", glyph: "B" },
  base: { bg: "bg-foreground text-background", glyph: "⌂" },
};

function markerElement(stop: MapStop): HTMLElement {
  const el = document.createElement("div");
  const style = STOP_STYLE[stop.kind];
  el.className = "relative flex flex-col items-center";
  el.innerHTML = `
    ${stop.kind === "base" ? '<span class="absolute top-0 size-7 rounded-full bg-brand/60 animate-halo"></span>' : ""}
    <span class="relative grid size-7 place-items-center rounded-full border-2 border-background text-[11px] font-semibold shadow-md ${style.bg}">${style.glyph}</span>
    <span class="mt-1 whitespace-nowrap rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur"></span>`;
  // textContent, not innerHTML, for the user-visible label.
  (el.lastElementChild as HTMLElement).textContent = stop.label;
  el.setAttribute("aria-label", stop.label);
  return el;
}
