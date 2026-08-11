import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

const loteId = idUuid("Seleccioná un lote");
const tipo = z.enum(["MUERTE", "DESCARTE"], { message: "Elegí un tipo." });
const cantidad = z.coerce.number().int().positive("Debe ser mayor a 0");

// Generado en el cliente (crypto.randomUUID()), no por Prisma — mismo
// patrón de idempotencia que Recolección (Sprint 5): sin esto, un doble
// envío no solo duplica la fila, decrementa avesVivas dos veces (bug real
// encontrado en la auditoría post-Sprint 5, ver memory/estado-proyecto.md
// — este es el módulo de mayor severidad de los auditados). Nunca lo
// elige el usuario a mano.
const id = idUuid();

export const crearRegistroMortalidadSchema = z.object({ id, loteId, tipo, cantidad });

export type CrearRegistroMortalidadInput = z.infer<typeof crearRegistroMortalidadSchema>;

export const revertirMortalidadSchema = z.object({ registroId: idUuid() });

export type RevertirMortalidadInput = z.infer<typeof revertirMortalidadSchema>;
