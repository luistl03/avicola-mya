import { describe, expect, it } from "vitest";

import {
  puedeAlojarEnGalpon,
  puedeDesactivarGalpon,
  puedeReducirCapacidad,
} from "@/server/services/galpon";

describe("puedeAlojarEnGalpon", () => {
  it("rechaza un galpón que no está ACTIVO, aunque haya capacidad de sobra", () => {
    const resultado = puedeAlojarEnGalpon({
      galponEstado: "INACTIVO",
      capacidadMaxima: 1000,
      avesActualesAlojadas: 0,
      avesEntrantes: 100,
    });

    expect(resultado).toEqual({ permitido: false, motivo: "El galpón no está activo." });
  });

  it("permite ocupar exactamente el límite de capacidad", () => {
    const resultado = puedeAlojarEnGalpon({
      galponEstado: "ACTIVO",
      capacidadMaxima: 500,
      avesActualesAlojadas: 300,
      avesEntrantes: 200,
    });

    expect(resultado).toEqual({ permitido: true });
  });

  it("rechaza si supera la capacidad por una sola ave", () => {
    const resultado = puedeAlojarEnGalpon({
      galponEstado: "ACTIVO",
      capacidadMaxima: 500,
      avesActualesAlojadas: 300,
      avesEntrantes: 201,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "Supera la capacidad del galpón (501/500 aves).",
    });
  });

  it("permite alojar con margen de sobra", () => {
    const resultado = puedeAlojarEnGalpon({
      galponEstado: "ACTIVO",
      capacidadMaxima: 500,
      avesActualesAlojadas: 0,
      avesEntrantes: 100,
    });

    expect(resultado).toEqual({ permitido: true });
  });
});

describe("puedeDesactivarGalpon", () => {
  it("bloquea desactivar un galpón que aloja al menos un lote", () => {
    const resultado = puedeDesactivarGalpon({ lotesAlojados: 1 });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "No se puede desactivar un galpón con lotes alojados.",
    });
  });

  it("permite desactivar un galpón vacío", () => {
    const resultado = puedeDesactivarGalpon({ lotesAlojados: 0 });

    expect(resultado).toEqual({ permitido: true });
  });
});

describe("puedeReducirCapacidad", () => {
  it("bloquea bajar la capacidad por debajo de la ocupación actual", () => {
    const resultado = puedeReducirCapacidad({ capacidadNueva: 200, avesActualesAlojadas: 300 });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "El galpón aloja 300 aves - no puede bajar de esa capacidad.",
    });
  });

  it("permite bajar la capacidad hasta exactamente la ocupación actual", () => {
    const resultado = puedeReducirCapacidad({ capacidadNueva: 300, avesActualesAlojadas: 300 });

    expect(resultado).toEqual({ permitido: true });
  });

  it("permite subir la capacidad por encima de la ocupación actual", () => {
    const resultado = puedeReducirCapacidad({ capacidadNueva: 1000, avesActualesAlojadas: 300 });

    expect(resultado).toEqual({ permitido: true });
  });
});
