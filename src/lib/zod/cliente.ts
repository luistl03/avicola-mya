import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(120);

// Mismo patrón que lib/zod/usuario.ts: un <input> vacío llega como "" (no
// undefined) al pasar por FormData — se normaliza a undefined antes de
// validar, para que celular/dirección puedan dejarse en blanco sin
// disparar ningún error de formato.
function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((valor) => (valor === "" ? undefined : valor), schema.optional());
}

const celular = opcional(z.string().trim().max(20, "Máximo 20 caracteres"));
const direccion = opcional(z.string().trim().max(200, "Máximo 200 caracteres"));

// Los 3 valores reales de negocio (decisión de negocio 4, spec.md):
// MAYORISTA/MINORISTA son clientes registrados; EVENTUAL es el tipo de
// venta ocasional/mostrador (el mismo que usa "Público General" en el seed).
const tipo = z.enum(["MAYORISTA", "MINORISTA", "EVENTUAL"]);

const clienteId = idUuid();

// Generado en el cliente (crypto.randomUUID()), no por Prisma — Cliente no
// tiene ningún campo @unique, mismo patrón de idempotencia que
// crearGalponSchema (server/actions/galpon.ts es la referencia real).
const id = idUuid();

export const crearClienteSchema = z.object({ id, nombre, celular, direccion, tipo });

export type CrearClienteInput = z.infer<typeof crearClienteSchema>;

export const editarClienteSchema = z.object({ clienteId, nombre, celular, direccion, tipo });

export type EditarClienteInput = z.infer<typeof editarClienteSchema>;

export const cambiarEstadoClienteSchema = z.object({
  clienteId,
  estado: z.enum(["ACTIVO", "SUSPENDIDO"]),
});

export type CambiarEstadoClienteInput = z.infer<typeof cambiarEstadoClienteSchema>;

// Sprint 9 — selector de cliente del POS. Sin id/clienteId (es una lectura,
// no una mutación) y sin los límites de crearClienteSchema (nombre/celular
// completos) — solo el texto que el operario ya escribió en el buscador.
export const buscarClientesAutocompleteSchema = z.object({
  busqueda: z.string().trim().min(1).max(120),
});

export type BuscarClientesAutocompleteInput = z.infer<typeof buscarClientesAutocompleteSchema>;
