import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

// Sin id de cliente — a diferencia de la mayoría de altas del proyecto,
// paqueteId/bandejaId ya son la unicidad de negocio que protege el create
// (RoturaPaquete.paqueteId / RoturaBandeja.bandejaId son @unique) — ver
// memory/convenciones.md, "Idempotencia por id de cliente": "Si el modelo
// ya tiene un campo @unique que el formulario llena siempre... no hace
// falta agregar un id de cliente".
export const romperPaqueteSchema = z.object({
  paqueteId: idUuid(),
  pesoExtraido: z.coerce.number().positive("El peso debe ser mayor a 0").max(999.999, "Peso fuera de rango"),
});
export type RomperPaqueteInput = z.infer<typeof romperPaqueteSchema>;

export const romperBandejaSchema = z.object({
  bandejaId: idUuid(),
  pesoExtraido: z.coerce.number().positive("El peso debe ser mayor a 0").max(999.999, "Peso fuera de rango"),
});
export type RomperBandejaInput = z.infer<typeof romperBandejaSchema>;
