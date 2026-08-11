import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

// El registro completo lo identifica el cliente (crypto.randomUUID()), no
// Prisma — es la pieza central del Contrato Offline-Ready de este sprint
// (memory/convenciones.md): permite que un reintento (mala señal, doble
// tap) sea idempotente en vez de crear un segundo registro. Nunca lo
// elige el usuario a mano, así que se queda con el mensaje genérico de
// idUuid() en vez de uno personalizado.
const id = idUuid();
const loteId = idUuid("Seleccioná un lote");
const cantidadTotal = z.coerce.number().int().positive("Debe ser mayor a 0");

// Reloj del celular en el momento de la captura — no es opcional: el
// Contrato Offline-Ready exige los dos timestamps siempre (creadoEnCliente
// + creadoEn, este último lo pone el servidor, no viaja en el payload).
const creadoEnCliente = z.coerce.date({ message: "Fecha inválida" });

// Un peso por cada paquete que calcularEmpaque(cantidadTotal) determinó
// en el cliente — el arreglo puede venir vacío (cantidadTotal < 180, cero
// paquetes). El .max(999.999) es una cota defensiva atada a la precisión
// real de Paquete.peso en Prisma (Decimal(6,3)), no una regla de negocio:
// sin esto, un valor absurdo llegaría a romper con un error crudo de
// Prisma en vez de un mensaje de validación claro. Que la CANTIDAD de
// pesos coincida con los paquetes esperados no se valida acá — requiere
// recalcular calcularEmpaque(cantidadTotal), que vive en
// server/services/recoleccion.ts; ese cruce lo hace la Server Action
// (server/actions/recoleccion.ts), no este schema.
const pesos = z
  .array(z.coerce.number().positive("El peso debe ser mayor a 0").max(999.999, "Peso fuera de rango"))
  .max(1000);

export const crearRecoleccionSchema = z.object({
  id,
  loteId,
  cantidadTotal,
  creadoEnCliente,
  pesos,
});

export type CrearRecoleccionInput = z.infer<typeof crearRecoleccionSchema>;
