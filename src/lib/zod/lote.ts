import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

const codigo = z.string().trim().min(1, "El código es obligatorio").max(40);

// "Hoy" se calcula en América/Lima (D5), no en la zona horaria del
// servidor — comparar Date crudos (UTC) haría que, por ejemplo, las
// primeras horas de un día en UTC (que todavía son "ayer" en Lima,
// UTC-5) rechacen como "futura" una fecha que en Lima sigue siendo hoy.
// toLocaleDateString("en-CA", ...) da directo el formato YYYY-MM-DD; el
// constructor de Date interpreta ese string como medianoche UTC, que es
// exactamente lo mismo que hace z.coerce.date() con el valor que manda
// el <input type="date">, así que la comparación queda pareja.
function hoyEnLima(): Date {
  return new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
}

const fechaIngreso = z.coerce
  .date({ message: "Fecha inválida" })
  .refine((fecha) => fecha.getTime() <= hoyEnLima().getTime(), {
    message: "La fecha de ingreso no puede ser futura.",
  });
const avesIniciales = z.coerce.number().int().positive("Debe ser mayor a 0");
// Edad de las aves en semanas al momento de fechaIngreso — 0 es válido
// (pollitos recién nacidos), pero no negativo. No es "opcional": el
// formulario siempre manda un valor (precargado en 0), así que no hace
// falta el patrón `opcional()` que usa lib/zod/usuario.ts para campos
// que el usuario puede dejar en blanco de verdad.
const edadInicialSemanas = z.coerce.number().int().nonnegative("No puede ser negativo");
const loteId = idUuid();
const galponId = idUuid("Seleccioná un galpón");

export const crearLoteSchema = z.object({
  codigo,
  fechaIngreso,
  avesIniciales,
  edadInicialSemanas,
  galponId,
});

export type CrearLoteInput = z.infer<typeof crearLoteSchema>;

export const mudarLoteSchema = z.object({ loteId, galponDestinoId: galponId });

export type MudarLoteInput = z.infer<typeof mudarLoteSchema>;

export const finalizarLoteSchema = z.object({ loteId });

export type FinalizarLoteInput = z.infer<typeof finalizarLoteSchema>;
