import type { Galpon } from "@prisma/client";

export function makeGalpon(overrides: Partial<Galpon> = {}): Galpon {
  return {
    id: crypto.randomUUID(),
    nombre: `Galpón ${crypto.randomUUID().slice(0, 4)}`,
    capacidadMaxima: 500,
    estado: "ACTIVO",
    creadoEn: new Date(),
    ...overrides,
  };
}
