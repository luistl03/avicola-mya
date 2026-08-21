import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  buscarSesionPorJtiMock,
  crearAuditLogMock,
  headersMock,
  crearOActualizarSuscripcionPushMock,
  eliminarSuscripcionPushDeUsuarioMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  crearOActualizarSuscripcionPushMock: vi.fn(),
  eliminarSuscripcionPushDeUsuarioMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: vi.fn(),
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/pushSubscription", () => ({
  crearOActualizarSuscripcionPush: crearOActualizarSuscripcionPushMock,
  eliminarSuscripcionPushDeUsuario: eliminarSuscripcionPushDeUsuarioMock,
}));

import { eliminarSuscripcionPush, suscribirPush } from "@/server/actions/pushSubscription";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const SUSCRIPCION_1_ID = crypto.randomUUID();

function sesionValida(usuarioId = GERENTE_1_ID) {
  return {
    id: "sesion-1",
    usuarioId,
    jti: "jti-1",
    creadaEn: AHORA,
    ultimaActividad: AHORA,
    revocada: false,
    revocadaEn: null,
  };
}

function sessionGerente() {
  return {
    sesionId: "jti-1",
    user: { id: GERENTE_1_ID, usuario: "gerente", nombre: "Gerente", rol: "GERENTE" as const },
  };
}

function sessionOperario() {
  return {
    sesionId: "jti-2",
    user: { id: OPERARIO_1_ID, usuario: "operario", nombre: "Operario", rol: "OPERARIO" as const },
  };
}

const inputSuscripcion = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  p256dh: "p256dh-valor",
  auth: "auth-valor",
};

describe("suscribirPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  it("un GERENTE puede suscribirse, escribe AuditLog SUSCRIBIR con entidad PushSubscription", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    crearOActualizarSuscripcionPushMock.mockResolvedValue({ id: SUSCRIPCION_1_ID, ...inputSuscripcion });

    const resultado = await suscribirPush(inputSuscripcion);

    expect(resultado).toEqual({ ok: true, data: { id: SUSCRIPCION_1_ID } });
    expect(crearOActualizarSuscripcionPushMock).toHaveBeenCalledWith(GERENTE_1_ID, inputSuscripcion);
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "PushSubscription", accion: "SUSCRIBIR", entidadId: SUSCRIPCION_1_ID }),
    );
  });

  it("un OPERARIO es rechazado (403) — feature exclusiva de GERENTE", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));

    const resultado = await suscribirPush(inputSuscripcion);

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
    expect(crearOActualizarSuscripcionPushMock).not.toHaveBeenCalled();
  });

  it("un endpoint inválido (no URL) es rechazado por Zod antes de tocar el repository", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());

    const resultado = await suscribirPush({ ...inputSuscripcion, endpoint: "no-es-una-url" });

    expect(resultado.ok).toBe(false);
    expect(crearOActualizarSuscripcionPushMock).not.toHaveBeenCalled();
  });
});

describe("eliminarSuscripcionPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  it("un GERENTE puede eliminar su propia suscripción, escribe AuditLog ELIMINAR", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    eliminarSuscripcionPushDeUsuarioMock.mockResolvedValue({ count: 1 });

    const resultado = await eliminarSuscripcionPush({ endpoint: inputSuscripcion.endpoint });

    expect(resultado).toEqual({ ok: true, data: null });
    expect(eliminarSuscripcionPushDeUsuarioMock).toHaveBeenCalledWith(GERENTE_1_ID, inputSuscripcion.endpoint);
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "PushSubscription", accion: "ELIMINAR", entidadId: inputSuscripcion.endpoint }),
    );
  });

  it("un OPERARIO es rechazado (403)", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));

    const resultado = await eliminarSuscripcionPush({ endpoint: inputSuscripcion.endpoint });

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
    expect(eliminarSuscripcionPushDeUsuarioMock).not.toHaveBeenCalled();
  });

  it("un endpoint que no le pertenece al usuario es un no-op silencioso (deleteMany no matchea)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    eliminarSuscripcionPushDeUsuarioMock.mockResolvedValue({ count: 0 });

    const resultado = await eliminarSuscripcionPush({ endpoint: inputSuscripcion.endpoint });

    expect(resultado).toEqual({ ok: true, data: null });
  });
});
