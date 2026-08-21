import { z } from "zod";

// Sin idUuid() acá: PushSubscription.id lo genera Prisma
// (@default(uuid())), el cliente nunca lo envía. La identidad real de la
// fila para el navegador es el endpoint (ya @unique en el schema) — no
// aplica el contrato offline-ready (suscribirse requiere conectividad por
// definición, no es una operación de campo sin señal).
export const suscribirPushSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export const eliminarSuscripcionPushSchema = z.object({
  endpoint: z.string().url(),
});
