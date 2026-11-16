import { describe, expect, it } from "vitest";
import { haversineKm, roadKm } from "./geo";
import { places } from "./test/fixtures";

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm(places.queretaro, places.queretaro)).toBe(0);
  });

  it("is symmetric", () => {
    expect(haversineKm(places.cdmx, places.monterrey)).toBeCloseTo(
      haversineKm(places.monterrey, places.cdmx),
      9,
    );
  });

  it("matches known straight-line distances", () => {
    // Monterrey → Nuevo Laredo is ~220 km in a straight line.
    expect(haversineKm(places.monterrey, places.laredo)).toBeGreaterThan(210);
    expect(haversineKm(places.monterrey, places.laredo)).toBeLessThan(230);
    // CDMX → Querétaro is ~184 km in a straight line (~210 km by road).
    expect(haversineKm(places.cdmx, places.queretaro)).toBeGreaterThan(175);
    expect(haversineKm(places.cdmx, places.queretaro)).toBeLessThan(195);
  });
});

describe("roadKm", () => {
  it("applies the road factor", () => {
    const straight = haversineKm(places.cdmx, places.queretaro);
    expect(roadKm(places.cdmx, places.queretaro, 1.25)).toBeCloseTo(straight * 1.25, 9);
  });
});
