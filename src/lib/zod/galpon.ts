import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(80);

// z.coerce: FormData entrega todo como string ("500"), normalizarInput de
// withAuth no convierte tipos, solo FormData -> objeto plano.
const capacidadMaxima = z.coerce.number().int().positive("Debe ser mayor a 0");

const galponId = idUuid();

// Generado en el cliente (crypto.randomUUID()), no por Prisma — mismo
// patrón de idempotencia que Recolección (Sprint 5): la Server Action
// intenta un create y, si el id ya existe (reintento por doble clic o
// reintento de red), responde con el registro ya persistido en vez de
// duplicar. Nunca lo elige el usuario a mano.
const id = idUuid();

export const crearGalponSchema = z.object({ id, nombre, capacidadMaxima });

export type CrearGalponInput = z.infer<typeof crearGalponSchema>;

export const editarGalponSchema = z.object({ galponId, nombre, capacidadMaxima });

export type EditarGalponInput = z.infer<typeof editarGalponSchema>;

export const cambiarEstadoGalponSchema = z.object({
  galponId,
  estado: z.enum(["ACTIVO", "INACTIVO"]),
});

export type CambiarEstadoGalponInput = z.infer<typeof cambiarEstadoGalponSchema>;
