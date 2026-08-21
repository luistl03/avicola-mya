import webPush from "web-push";

const vapidConfigurado = Boolean(
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT,
);

if (vapidConfigurado) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

export type ResultadoEnvioPush = { ok: true } | { ok: false; suscripcionInvalida: boolean };

/**
 * Envía una notificación push real a una suscripción. `suscripcionInvalida`
 * viene en `true` solo si el servicio de push respondió 404/410 (Sprint 16,
 * corolario de diseño 2: el navegador ya revocó esta suscripción, la fila
 * de PushSubscription se puede borrar) — cualquier otro código de error se
 * trata como fallo transitorio, no se elimina nada.
 */
export async function enviarNotificacionPush(
  suscripcion: { endpoint: string; p256dh: string; auth: string },
  payload: { titulo: string; cuerpo: string; url: string },
): Promise<ResultadoEnvioPush> {
  if (!vapidConfigurado) {
    // Sin claves VAPID configuradas (entorno local sin .env completo, o
    // primer deploy antes de cargar las env vars en Vercel) — no se
    // bloquea nada, mismo criterio que lib/rate-limit.ts sin Upstash.
    return { ok: false, suscripcionInvalida: false };
  }

  try {
    await webPush.sendNotification(
      { endpoint: suscripcion.endpoint, keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth } },
      JSON.stringify({ titulo: payload.titulo, cuerpo: payload.cuerpo, url: payload.url }),
    );
    return { ok: true };
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    return { ok: false, suscripcionInvalida: statusCode === 404 || statusCode === 410 };
  }
}
