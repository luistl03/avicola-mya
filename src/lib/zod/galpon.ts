import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(80);

// z.coerce: FormData entrega todo como string ("500"), normalizarInput de
// withAuth no convierte tipos, solo FormData -> objeto plano.
const capacidadMaxima = z.coerce.number().int().positive("Debe ser mayor a 0");

const galponId = idUuid();

export const crearGalponSchema = z.object({ nombre, capacidadMaxima });

export type CrearGalponInput = z.infer<typeof crearGalponSchema>;

export const editarGalponSchema = z.object({ galponId, nombre, capacidadMaxima });

export type EditarGalponInput = z.infer<typeof editarGalponSchema>;

export const cambiarEstadoGalponSchema = z.object({
  galponId,
  estado: z.enum(["ACTIVO", "INACTIVO"]),
});

export type CambiarEstadoGalponInput = z.infer<typeof cambiarEstadoGalponSchema>;
