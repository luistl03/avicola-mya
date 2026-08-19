import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

// Mismo helper que ya usan lib/zod/usuario.ts, lib/zod/cliente.ts y
// lib/zod/empleado.ts — un <input> vacío llega como "" (no undefined).
function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((valor) => (valor === "" ? undefined : valor), schema.optional());
}

const tipo = z.enum(["SUELDO_BASE", "ADELANTO", "BONO", "DESCUENTO"], { message: "Elegí un tipo." });
const monto = z.coerce.number().positive("El monto debe ser mayor a 0");
const descripcion = opcional(z.string().trim().max(200, "Máximo 200 caracteres"));

// Sin `fecha`: a diferencia de Egreso, SueldoMovimiento.fecha siempre es
// "ahora" (no editable, decisión 2 de spec.md) — el servidor la pone con
// @default(now()), el formulario no la pide. id generado en el cliente —
// mismo motivo de idempotencia que Egreso (dos movimientos idénticos del
// mismo empleado el mismo día son legítimos, ej. dos ADELANTO seguidos).
export const crearSueldoMovimientoSchema = z.object({
  id: idUuid(),
  empleadoId: idUuid("Seleccioná un empleado"),
  tipo,
  monto,
  descripcion,
});

export type CrearSueldoMovimientoInput = z.infer<typeof crearSueldoMovimientoSchema>;

export const revertirSueldoMovimientoSchema = z.object({ id: idUuid() });

export type RevertirSueldoMovimientoInput = z.infer<typeof revertirSueldoMovimientoSchema>;
