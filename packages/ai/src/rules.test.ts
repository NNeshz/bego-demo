import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseTripRules, parseWhen } from "./rules";
import { cities, mx, NOW } from "./test/fixtures";

const parse = (text: string, context = {}) => parseTripRules(text, cities, NOW, context);

describe("parseTripRules", () => {
  it("understands the flagship sentence", () => {
    expect(
      parse("Descargo en Laredo mañana a las 10, traigo caja seca de 53, mi base es Querétaro"),
    ).toEqual({
      unloadCityId: "nuevo-laredo",
      unloadAt: mx("2026-11-17", "10:00"),
      unitType: "dry_van_53",
      baseCityId: "queretaro",
    });
  });

  it("handles abbreviations, 'de la tarde' and 'soy de'", () => {
    expect(parse("entrego en cdmx hoy a las 5 de la tarde, traigo refri, soy de mty")).toEqual({
      unloadCityId: "cdmx",
      unloadAt: mx("2026-11-16", "17:00"),
      unitType: "reefer_53",
      baseCityId: "monterrey",
    });
  });

  it("tells Laredo, Texas apart from Nuevo Laredo", () => {
    expect(parse("descargo en Laredo Texas").unloadCityId).toBe("laredo-tx");
    expect(parse("descargo en Nuevo Laredo").unloadCityId).toBe("nuevo-laredo");
  });

  it("reads cities without explicit cues in order: unload first, then base", () => {
    const result = parse("gdl, full, regreso a León");
    expect(result.unloadCityId).toBe("guadalajara");
    expect(result.baseCityId).toBe("leon");
    expect(result.unitType).toBe("full_double");
  });

  it("assigns a lone answer to the field that was asked", () => {
    expect(parse("Querétaro", { expecting: "baseCityId" }).baseCityId).toBe("queretaro");
    expect(parse("Querétaro", { known: { unloadCityId: "monterrey" } }).baseCityId).toBe(
      "queretaro",
    );
    expect(parse("Querétaro").unloadCityId).toBe("queretaro");
  });

  it("returns nulls for what it can't find", () => {
    expect(parse("ando en la carretera")).toEqual({
      unloadCityId: null,
      unloadAt: null,
      unitType: null,
      baseCityId: null,
    });
  });

  it("never throws and only returns known cities, whatever the input", () => {
    const ids = new Set(cities.map((c) => c.id));
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        const result = parse(text);
        for (const id of [result.unloadCityId, result.baseCityId]) {
          if (id !== null) expect(ids.has(id)).toBe(true);
        }
        if (result.unloadAt !== null)
          expect(Number.isFinite(Date.parse(result.unloadAt))).toBe(true);
      }),
    );
  });
});

describe("parseWhen", () => {
  // NOW is Monday 10:00 in Mexico City.
  const cases: Array<[string, string | null]> = [
    ["mañana a las 10", mx("2026-11-17", "10:00")],
    ["mañana en la mañana", mx("2026-11-17", "09:00")],
    ["pasado mañana a las 7:30", mx("2026-11-18", "07:30")],
    ["hoy a las 10 de la noche", mx("2026-11-16", "22:00")],
    ["a las 6 pm", mx("2026-11-16", "18:00")],
    ["a las 8", mx("2026-11-17", "08:00")], // 08:00 already passed today
    ["el jueves", mx("2026-11-19", "09:00")],
    ["el jueves a las dos de la tarde", mx("2026-11-19", "14:00")],
    ["hoy al mediodía", mx("2026-11-16", "12:00")],
    ["traigo caja de 53", null], // "53" is not a time
    ["sin fecha", null],
  ];

  it.each(cases)("%s", (text, expected) => {
    expect(
      parseWhen(
        text
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase(),
        NOW,
      ),
    ).toBe(expected);
  });
});
