import { CLIENTE_PUBLICO_GENERAL_ID } from "@/lib/constants";

// Guard de negocio para el cliente de mostrador del sistema (sembrado en
// prisma/seed.ts) — vive acá, no inline en server/actions/cliente.ts, mismo
// criterio que puedeDesactivarGalpon/puedeReducirCapacidad
// (server/services/galpon.ts): una Server Action solo orquesta (leer,
// preguntar al guard, actuar), no decide.
export function esClientePublicoGeneral(clienteId: string): boolean {
  return clienteId === CLIENTE_PUBLICO_GENERAL_ID;
}
