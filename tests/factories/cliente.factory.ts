import type { Cliente } from "@prisma/client";

export function makeCliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: crypto.randomUUID(),
    nombre: "Cliente de Prueba",
    celular: null,
    direccion: null,
    tipo: "MINORISTA",
    estado: "ACTIVO",
    ...overrides,
  };
}
