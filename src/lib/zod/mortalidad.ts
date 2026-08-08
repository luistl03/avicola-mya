import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

const loteId = idUuid("Seleccioná un lote");
const tipo = z.enum(["MUERTE", "DESCARTE"], { message: "Elegí un tipo." });
const cantidad = z.coerce.number().int().positive("Debe ser mayor a 0");

export const crearRegistroMortalidadSchema = z.object({ loteId, tipo, cantidad });

export type CrearRegistroMortalidadInput = z.infer<typeof crearRegistroMortalidadSchema>;

export const revertirMortalidadSchema = z.object({ registroId: idUuid() });

export type RevertirMortalidadInput = z.infer<typeof revertirMortalidadSchema>;
