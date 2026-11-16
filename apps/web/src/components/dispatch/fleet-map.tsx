"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Place, SimSegment } from "@retorno/engine";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, type RefObject } from "react";
import { arcPoints } from "@/lib/geo-arc";
import { loadMaplibre, MAP_COLORS, MAP_STYLES, type MapTheme } from "@/lib/maplibre";
import { frameAt, type Corridor } from "@/lib/sim-playback";
import { cn } from "@/lib/utils";

export interface FleetMapData {
  trucks: Array<{ id: string; base: Place }>;
  byTruck: Map<string, SimSegment[]>;
  corridors: Corridor[];
}

// Covers every city in the market (Hermosillo → Mérida, Juárez → Lázaro Cárdenas).
const MEXICO_BOUNDS: [[number, number], [number, number]] = [
  [-112, 17.4],
  [-89, 32],
];
const TRAIL_BUCKET_MS = 2 * 3_600_000;

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

/**
 * The fleet moving through the week. Time comes from `timeRef` (read every
 * animation frame) so playback stays smooth without re-rendering React.
 */
export function FleetMap({
  data,
  timeRef,
  showCorridors,
  selectedTruckId,
  className,
}: {
  data: FleetMapData;
  timeRef: RefObject<number>;
  showCorridors: boolean;
  selectedTruckId: string | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const { resolvedTheme } = useTheme();
  const theme: MapTheme = resolvedTheme === "dark" ? "dark" : "light";
  const themeRef = useRef(theme);
  const [failed, setFailed] = useState(false);

  // Latest props for the animation loop (refs, so the loop never restarts).
  const dataRef = useRef(data);
  const selectedRef = useRef(selectedTruckId);
  const showCorridorsRef = useRef(showCorridors);
  const dirtyRef = useRef(true);

  useEffect(() => {
    dataRef.current = data;
    selectedRef.current = selectedTruckId;
    showCorridorsRef.current = showCorridors;
    themeRef.current = theme;
    dirtyRef.current = true;
  });

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let lastT = Number.NaN;
    let lastBucket = Number.NaN;

    void (async () => {
      const maplibre = await loadMaplibre();
      if (cancelled || !containerRef.current) return;
      let map: MapLibreMap;
      try {
        map = new maplibre.Map({
          container: containerRef.current,
          style: MAP_STYLES[themeRef.current],
          bounds: MEXICO_BOUNDS,
          fitBoundsOptions: { padding: 24 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
        });
      } catch {
        setFailed(true);
        return;
      }
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();

      const onStyle = () => {
        addLayers(map, themeRef.current);
        dirtyRef.current = true;
      };
      map.on("style.load", onStyle);

      const tick = () => {
        const t = timeRef.current ?? 0;
        if (map.isStyleLoaded() && map.getSource("vehicles")) {
          const { trucks, byTruck, corridors } = dataRef.current;
          const dirty = dirtyRef.current;

          if (dirty || t !== lastT) {
            (map.getSource("vehicles") as GeoJSONSource).setData({
              type: "FeatureCollection",
              features: trucks.map((truck) => {
                const f = frameAt(byTruck.get(truck.id) ?? [], t, truck.base);
                return {
                  type: "Feature",
                  properties: {
                    id: truck.id,
                    kind: f.kind,
                    selected: truck.id === selectedRef.current ? 1 : 0,
                  },
                  geometry: { type: "Point", coordinates: [f.lng, f.lat] },
                };
              }),
            });
          }

          const bucket = Math.floor(t / TRAIL_BUCKET_MS);
          if (dirty || bucket !== lastBucket) {
            (map.getSource("trails") as GeoJSONSource).setData({
              type: "FeatureCollection",
              features: [...byTruck.values()].flatMap((segments) =>
                segments
                  .filter((s) => s.kind !== "idle" && s.endMs <= t && s.from.cityId !== s.to.cityId)
                  .map((s) => ({
                    type: "Feature" as const,
                    properties: { kind: s.kind },
                    geometry: {
                      type: "LineString" as const,
                      coordinates: arcPoints(s.from, s.to, 16),
                    },
                  })),
              ),
            });
            lastBucket = bucket;
          }

          if (dirty) {
            (map.getSource("corridors") as GeoJSONSource).setData({
              type: "FeatureCollection",
              features: corridors.map((c) => ({
                type: "Feature",
                properties: { km: c.km },
                geometry: { type: "LineString", coordinates: arcPoints(c.from, c.to, 24) },
              })),
            });
            map.setLayoutProperty(
              "corridors",
              "visibility",
              showCorridorsRef.current ? "visible" : "none",
            );
            dirtyRef.current = false;
          }
          lastT = t;
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [timeRef]);

  // Theme switch: new basemap; "style.load" re-adds our layers.
  useEffect(() => {
    mapRef.current?.setStyle(MAP_STYLES[theme]);
  }, [theme]);

  if (failed) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-3xl border bg-muted text-sm text-muted-foreground",
          className,
        )}
      >
        No pudimos cargar el mapa en este dispositivo.
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-3xl border", className)}>
      <div ref={containerRef} className="h-full w-full" role="img" aria-label="Mapa de la flota" />
    </div>
  );
}

function addLayers(map: MapLibreMap, theme: MapTheme) {
  if (map.getSource("vehicles")) return;
  const c = MAP_COLORS[theme];
  map.addSource("corridors", { type: "geojson", data: EMPTY_FC });
  map.addSource("trails", { type: "geojson", data: EMPTY_FC });
  map.addSource("vehicles", { type: "geojson", data: EMPTY_FC });

  map.addLayer({
    id: "corridors",
    type: "line",
    source: "corridors",
    layout: { "line-cap": "round" },
    paint: {
      "line-color": c.corridor,
      "line-opacity": 0.5,
      "line-blur": 2,
      "line-width": ["interpolate", ["linear"], ["get", "km"], 0, 2, 1500, 8, 5000, 18],
    },
  });
  map.addLayer({
    id: "trails-empty",
    type: "line",
    source: "trails",
    filter: ["==", ["get", "kind"], "empty"],
    paint: {
      "line-color": c.empty,
      "line-width": 1.2,
      "line-opacity": 0.45,
      "line-dasharray": [2, 2],
    },
  });
  map.addLayer({
    id: "trails-loaded",
    type: "line",
    source: "trails",
    filter: ["==", ["get", "kind"], "loaded"],
    layout: { "line-cap": "round" },
    paint: { "line-color": c.loaded, "line-width": 1.6, "line-opacity": 0.5 },
  });
  map.addLayer({
    id: "vehicles",
    type: "circle",
    source: "vehicles",
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "selected"], 1],
        10,
        ["match", ["get", "kind"], "loaded", 6.5, "empty", 5.5, 4],
      ],
      "circle-color": ["match", ["get", "kind"], "loaded", c.loaded, "empty", c.empty, c.idle],
      "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 3, 1.5],
      "circle-stroke-color": ["case", ["==", ["get", "selected"], 1], c.vehicle, c.halo],
    },
  });
}
