import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

// Sin .max() sobre monto — el guard real (no superar el saldo pendiente)
// depende de Credito.montoTotal/montoPagado, que Zod no conoce; vive en
// server/repositories/credito.ts (guard atómico) con un chequeo previo en
// la Server Action para el mensaje (ver plan.md).
export const registrarAbonoSchema = z.object({
  id: idUuid(), // HistorialAbonos.id, generado en el cliente una sola vez
  creditoId: idUuid(),
  monto: z.coerce.number().positive("El abono debe ser mayor a 0"),
  metodoPago: z.enum(["EFECTIVO", "YAPE", "PLIN", "TRANSFERENCIA"]),
});

export type RegistrarAbonoInput = z.infer<typeof registrarAbonoSchema>;
