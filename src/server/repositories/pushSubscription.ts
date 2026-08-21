import { prisma } from "@/lib/prisma";

// H1 — upsert por endpoint (ya @unique en el schema): un mismo navegador
// reintentando "Activar" no duplica fila, solo refresca p256dh/auth si el
// navegador rotó las claves internas de la suscripción.
export function crearOActualizarSuscripcionPush(
  usuarioId: string,
  datos: { endpoint: string; p256dh: string; auth: string },
) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: datos.endpoint },
    create: { usuarioId, ...datos },
    update: { usuarioId, p256dh: datos.p256dh, auth: datos.auth },
  });
}

// H1 — solo borra la propia suscripción del usuario que la pide (nunca un
// endpoint ajeno). deleteMany es no-op silencioso si no matchea, mismo
// criterio que el resto del proyecto para "reintento sin fila real".
export function eliminarSuscripcionPushDeUsuario(usuarioId: string, endpoint: string) {
  return prisma.pushSubscription.deleteMany({ where: { usuarioId, endpoint } });
}

// H2 — destinatarios del cron: solo GERENTE con Usuario.estado ACTIVO (un
// Gerente desactivado no debería seguir recibiendo avisos).
export function listarSuscripcionesPushDeGerentesActivos() {
  return prisma.pushSubscription.findMany({
    where: { usuario: { rol: "GERENTE", estado: "ACTIVO" } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
}

// H3 — limpieza tras un 404/410 real (lib/webPush.ts lo determina). No es
// una entidad de negocio (sin valor de auditoría una vez que el navegador
// la revocó) — DELETE físico, no soft-delete.
export function eliminarSuscripcionPushPorId(id: string) {
  return prisma.pushSubscription.deleteMany({ where: { id } });
}
