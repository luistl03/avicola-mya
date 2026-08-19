import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

const categoria = z.enum(["ALIMENTACION", "VACUNACION", "OBSERVACION"], {
  message: "Elegí una categoría.",
});
const contenido = z.string().trim().min(1, "La nota no puede estar vacía.").max(2000);

// Generado en el cliente (crypto.randomUUID()), no por Prisma — mismo
// patrón de idempotencia que Recolección/Galpón: sin unicidad de negocio
// posible sobre `contenido`, este id es la única defensa real contra un
// doble envío. Nunca lo elige el usuario a mano.
const id = idUuid();

// Reloj del celular en el momento de la captura — Contrato Offline-Ready
// (Sprint 14), mismo patrón que crearRecoleccionSchema/
// crearRegistroMortalidadSchema.
const creadoEnCliente = z.coerce.date({ message: "Fecha inválida" });

export const crearNotaBitacoraSchema = z.object({ id, categoria, contenido, creadoEnCliente });

export type CrearNotaBitacoraInput = z.infer<typeof crearNotaBitacoraSchema>;

const notaId = idUuid();

export const editarNotaBitacoraSchema = z.object({ notaId, categoria, contenido });

export type EditarNotaBitacoraInput = z.infer<typeof editarNotaBitacoraSchema>;

export const eliminarNotaBitacoraSchema = z.object({ notaId });

export type EliminarNotaBitacoraInput = z.infer<typeof eliminarNotaBitacoraSchema>;

// Input del fetch de scroll infinito — todo opcional salvo `take`, que el
// cliente no controla (constante fija, ver PAGE_SIZE_MURO en
// bitacora-muro.tsx). cursorId usa idUuid() igual que cualquier id: es un
// id real de BitacoraGlobal, no texto libre.
export const obtenerMasBitacoraSchema = z.object({
  cursorId: idUuid().optional(),
  categoria: categoria.optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

export type ObtenerMasBitacoraInput = z.infer<typeof obtenerMasBitacoraSchema>;
