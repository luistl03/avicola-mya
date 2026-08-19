import { z } from "zod";

import { hoyEnLima, idUuid } from "@/lib/zod/comun";

const categoria = z.enum(["ALIMENTOS", "INSUMOS_VACUNAS", "SERVICIOS", "MANTENIMIENTO", "VARIOS"], {
  message: "Elegí una categoría.",
});
const monto = z.coerce.number().positive("El monto debe ser mayor a 0");
const descripcion = z.string().trim().min(1, "La descripción es obligatoria").max(200);
const fecha = z.coerce
  .date({ message: "Fecha inválida" })
  .refine((f) => f.getTime() <= hoyEnLima().getTime(), { message: "La fecha no puede ser futura." });

// id generado en el cliente — Egreso no tiene ningún campo con unicidad
// de negocio (dos gastos idénticos el mismo día son legítimos), así que
// aplica el patrón completo de idempotencia por id de cliente
// (convenciones.md, "Idempotencia por id de cliente").
export const crearEgresoSchema = z.object({ id: idUuid(), categoria, monto, descripcion, fecha });

export type CrearEgresoInput = z.infer<typeof crearEgresoSchema>;

// Mismos campos que crear (decisión 1: editable sin límite de tiempo
// mientras no esté anulado) — la guard de "no editar un revertido" vive
// en el repository, no acá.
export const editarEgresoSchema = z.object({ id: idUuid(), categoria, monto, descripcion, fecha });

export type EditarEgresoInput = z.infer<typeof editarEgresoSchema>;

export const revertirEgresoSchema = z.object({ id: idUuid() });

export type RevertirEgresoInput = z.infer<typeof revertirEgresoSchema>;
