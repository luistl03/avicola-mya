import type { Lote } from "@prisma/client";

export function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: crypto.randomUUID(),
    codigo: `LOTE-${crypto.randomUUID().slice(0, 8)}`,
    fechaIngreso: new Date(),
    avesIniciales: 500,
    avesVivas: 500,
    edadInicialSemanas: 0,
    estado: "ACTIVO",
    ...overrides,
  };
}
