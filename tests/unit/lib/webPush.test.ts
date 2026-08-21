import { beforeEach, describe, expect, it, vi } from "vitest";

// web-push se mockea completo — no hay forma práctica de reproducir un
// 404/410 real de un servicio de push (FCM/Mozilla) contra un endpoint de
// prueba local sin TLS real (web-push siempre usa el módulo `https` de
// Node, confirmado leyendo su código fuente, sin importar el protocolo
// declarado en el endpoint) — verificado en vivo durante S16-14 contra
// Neon dev: 3 tipos distintos de fallo NO-404/410 (DNS, redirect 307,
// error TLS) dejaron la suscripción intacta como se esperaba, pero
// reproducir el caso 404/410 real exige un servicio de push real. Este
// test cubre ese caso con un mock del error que web-push documenta
// (WebPushError con `.statusCode`).
const { setVapidDetailsMock, sendNotificationMock } = vi.hoisted(() => ({
  setVapidDetailsMock: vi.fn(),
  sendNotificationMock: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: { setVapidDetails: setVapidDetailsMock, sendNotification: sendNotificationMock },
}));

const suscripcion = { endpoint: "https://push.example.com/abc", p256dh: "p256dh", auth: "auth" };
const payload = { titulo: "Crédito vencido", cuerpo: "Juan debe S/ 100.00", url: "/creditos" };

describe("enviarNotificacionPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VAPID_PUBLIC_KEY", "clave-publica");
    vi.stubEnv("VAPID_PRIVATE_KEY", "clave-privada");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
    vi.resetModules();
  });

  it("envío exitoso — { ok: true }", async () => {
    sendNotificationMock.mockResolvedValue(undefined);
    const { enviarNotificacionPush } = await import("@/lib/webPush");

    const resultado = await enviarNotificacionPush(suscripcion, payload);

    expect(resultado).toEqual({ ok: true });
    expect(sendNotificationMock).toHaveBeenCalledWith(
      { endpoint: suscripcion.endpoint, keys: { p256dh: "p256dh", auth: "auth" } },
      JSON.stringify({ titulo: payload.titulo, cuerpo: payload.cuerpo, url: payload.url }),
    );
  });

  it("error 404 (suscripción revocada por el navegador) — suscripcionInvalida: true", async () => {
    const error = Object.assign(new Error("Not Found"), { statusCode: 404 });
    sendNotificationMock.mockRejectedValue(error);
    const { enviarNotificacionPush } = await import("@/lib/webPush");

    const resultado = await enviarNotificacionPush(suscripcion, payload);

    expect(resultado).toEqual({ ok: false, suscripcionInvalida: true });
  });

  it("error 410 (suscripción vencida) — suscripcionInvalida: true", async () => {
    const error = Object.assign(new Error("Gone"), { statusCode: 410 });
    sendNotificationMock.mockRejectedValue(error);
    const { enviarNotificacionPush } = await import("@/lib/webPush");

    const resultado = await enviarNotificacionPush(suscripcion, payload);

    expect(resultado).toEqual({ ok: false, suscripcionInvalida: true });
  });

  it("error transitorio (500, sin relación con la suscripción) — suscripcionInvalida: false", async () => {
    const error = Object.assign(new Error("Internal Server Error"), { statusCode: 500 });
    sendNotificationMock.mockRejectedValue(error);
    const { enviarNotificacionPush } = await import("@/lib/webPush");

    const resultado = await enviarNotificacionPush(suscripcion, payload);

    expect(resultado).toEqual({ ok: false, suscripcionInvalida: false });
  });

  it("error sin statusCode (ej. timeout de red) — suscripcionInvalida: false", async () => {
    sendNotificationMock.mockRejectedValue(new Error("network timeout"));
    const { enviarNotificacionPush } = await import("@/lib/webPush");

    const resultado = await enviarNotificacionPush(suscripcion, payload);

    expect(resultado).toEqual({ ok: false, suscripcionInvalida: false });
  });

  it("sin claves VAPID configuradas — no bloquea, responde ok:false sin marcar la suscripción como inválida", async () => {
    vi.unstubAllEnvs();
    const { enviarNotificacionPush } = await import("@/lib/webPush");

    const resultado = await enviarNotificacionPush(suscripcion, payload);

    expect(resultado).toEqual({ ok: false, suscripcionInvalida: false });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});
