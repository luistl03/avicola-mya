import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: mismo patrón que recoleccion.test.ts/inventario.test.ts. El
// service puro de server/services/consolidacion.ts (calcularConsolidacion)
// NO se mockea — se ejercita real, mismo criterio que calcularEmpaque en
// recoleccion.test.ts.
const {
  authMock,
  buscarSesionPorJtiMock,
  revocarSesionMock,
  crearAuditLogMock,
  headersMock,
  listarInventarioSueltosConSaldoMock,
  consolidarSueltosRepoMock,
  buscarRegistroConsolidacionConUnidadesPorIdMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  revocarSesionMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  listarInventarioSueltosConSaldoMock: vi.fn(),
  consolidarSueltosRepoMock: vi.fn(),
  buscarRegistroConsolidacionConUnidadesPorIdMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: revocarSesionMock,
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/inventario", () => ({
  listarInventarioSueltosConSaldo: listarInventarioSueltosConSaldoMock,
}));

// SaldoInsuficienteConsolidacionError se re-declara acá (no se importa la
// clase real) porque el mock completo del módulo reemplaza también esa
// exportación — la action importa la misma clase mockeada, así que el
// `instanceof` del catch de server/actions/consolidacion.ts sigue
// funcionando. Mismo patrón que YaRevertidoError en recoleccion.test.ts.
vi.mock("@/server/repositories/consolidacion", () => ({
  consolidarSueltos: consolidarSueltosRepoMock,
  buscarRegistroConsolidacionConUnidadesPorId: buscarRegistroConsolidacionConUnidadesPorIdMock,
  SaldoInsuficienteConsolidacionError: class SaldoInsuficienteConsolidacionError extends Error {},
}));

import { consolidarBandejaAction, consolidarPaqueteMixtoAction } from "@/server/actions/consolidacion";
import { SaldoInsuficienteConsolidacionError } from "@/server/repositories/consolidacion";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const GALPON_A_ID = crypto.randomUUID();
const GALPON_B_ID = crypto.randomUUID();
const LOTE_1_ID = crypto.randomUUID();
const LOTE_2_ID = crypto.randomUUID();
const CONSOLIDACION_1_ID = crypto.randomUUID();

function sesionValida() {
  return {
    id: "sesion-1",
    usuarioId: GERENTE_1_ID,
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

function erroDeUnicidad() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.3",
  });
}

describe("consolidarPaqueteMixtoAction", () => {
  const inputBase = {
    id: CONSOLIDACION_1_ID,
    origenes: [
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID },
      { galponId: GALPON_B_ID, loteId: LOTE_2_ID },
    ],
    creadoEnCliente: new Date("2025-12-31T23:58:00.000Z"),
    pesos: [12.5], // A(120) + B(90) = 210 -> 1 paquete de 180, 30 sueltos sin consolidar
  };

  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rechaza si no hay saldo suficiente para formar ninguna unidad, sin llegar a tocar el repository de escritura", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    listarInventarioSueltosConSaldoMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 50 },
    ]);

    const resultado = await consolidarPaqueteMixtoAction({
      ...inputBase,
      origenes: [{ galponId: GALPON_A_ID, loteId: LOTE_1_ID }],
    });

    expect(resultado).toEqual({
      ok: false,
      error: "No hay saldo suficiente para formar al menos un paquete completo (mínimo 180).",
    });
    expect(consolidarSueltosRepoMock).not.toHaveBeenCalled();
  });

  it("trata como disponible=0 un origen elegido que ya no tiene fila en InventarioSueltos (saldo desactualizado del cliente)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    // El cliente eligió un origen que, al releer fresco, ya no aparece en
    // absoluto (otra operación lo consumió del todo entre medio) — el Map
    // de saldoPorClave no lo encuentra, cae en el fallback `?? 0`.
    listarInventarioSueltosConSaldoMock.mockResolvedValue([]);

    const resultado = await consolidarPaqueteMixtoAction({
      ...inputBase,
      origenes: [{ galponId: GALPON_A_ID, loteId: LOTE_1_ID }],
      pesos: [12.5],
    });

    expect(resultado).toEqual({
      ok: false,
      error: "No hay saldo suficiente para formar al menos un paquete completo (mínimo 180).",
    });
    expect(consolidarSueltosRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza si se piden más pesos que el máximo recalculado en el servidor (saldo desactualizado)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    listarInventarioSueltosConSaldoMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 120 },
      { galponId: GALPON_B_ID, loteId: LOTE_2_ID, cantidad: 90 },
    ]);

    // El máximo real es 1 paquete, pero llegan 2 pesos (payload
    // manipulado, o el saldo bajó entre que el cliente calculó el techo y
    // confirmó el wizard).
    const resultado = await consolidarPaqueteMixtoAction({ ...inputBase, pesos: [12.5, 12.6] });

    expect(resultado).toEqual({
      ok: false,
      error:
        "Los saldos cambiaron — el máximo disponible ahora es 1, se recibieron 2 pesos. Actualizá la pantalla e intentá de nuevo.",
    });
    expect(consolidarSueltosRepoMock).not.toHaveBeenCalled();
  });

  // Corrección real post-diseño (probado en vivo, decisión confirmada por
  // el Product Owner): el wizard ya NO arma automáticamente todas las
  // unidades que el saldo permite — el operario elige cuántas, desde 1
  // hasta el techo. Pedir MENOS pesos que el máximo ahora es un caso
  // válido, no un error.
  it("acepta pedir MENOS unidades que el máximo que el saldo permite (control manual del operario)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    listarInventarioSueltosConSaldoMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 400 },
    ]);
    consolidarSueltosRepoMock.mockResolvedValue({
      registro: { id: CONSOLIDACION_1_ID },
      creadas: [{ id: "p1" }],
    });

    // 400 disponibles = techo de 2 paquetes completos, pero el operario
    // solo pidió 1.
    const resultado = await consolidarPaqueteMixtoAction({
      ...inputBase,
      origenes: [{ galponId: GALPON_A_ID, loteId: LOTE_1_ID }],
      pesos: [12.1],
    });

    expect(resultado).toEqual({
      ok: true,
      data: { id: CONSOLIDACION_1_ID, unidadesCreadas: 1, totalConsolidado: 180 },
    });
    expect(consolidarSueltosRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        unidades: [{ peso: 12.1, origenes: [{ galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 180 }] }],
      }),
    );
  });

  it("traduce SaldoInsuficienteConsolidacionError (carrera real) a un mensaje claro", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    listarInventarioSueltosConSaldoMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 120 },
      { galponId: GALPON_B_ID, loteId: LOTE_2_ID, cantidad: 90 },
    ]);
    consolidarSueltosRepoMock.mockRejectedValue(new SaldoInsuficienteConsolidacionError());

    const resultado = await consolidarPaqueteMixtoAction(inputBase);

    expect(resultado).toEqual({
      ok: false,
      error: "El saldo ya no alcanza para esta consolidación — actualizá la pantalla e intentá de nuevo.",
    });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });

  it("consolida con un solo origen que alcanza para varias unidades, y escribe AuditLog", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    listarInventarioSueltosConSaldoMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 400 },
    ]);
    consolidarSueltosRepoMock.mockResolvedValue({
      registro: { id: CONSOLIDACION_1_ID },
      creadas: [{ id: "p1" }, { id: "p2" }],
    });

    const resultado = await consolidarPaqueteMixtoAction({
      ...inputBase,
      origenes: [{ galponId: GALPON_A_ID, loteId: LOTE_1_ID }],
      pesos: [12.1, 12.2],
    });

    expect(resultado).toEqual({
      ok: true,
      data: { id: CONSOLIDACION_1_ID, unidadesCreadas: 2, totalConsolidado: 360 },
    });
    // 400 = 180 + 180 + 40 sobrante — el mismo origen aporta a las dos
    // unidades, confirma que la action zippea porciones+pesos sin alterar
    // lo que calcularConsolidacion() determinó.
    expect(consolidarSueltosRepoMock).toHaveBeenCalledWith({
      id: CONSOLIDACION_1_ID,
      tipo: "PAQUETE_MIXTO",
      unidades: [
        { peso: 12.1, origenes: [{ galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 180 }] },
        { peso: 12.2, origenes: [{ galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 180 }] },
      ],
      usuarioId: GERENTE_1_ID,
      creadoEnCliente: inputBase.creadoEnCliente,
      ahora: AHORA,
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "RegistroConsolidacion",
        accion: "CONSOLIDAR_PAQUETE_MIXTO",
        entidadId: CONSOLIDACION_1_ID,
      }),
    );
  });

  it("consolida con múltiples orígenes que juntos completan una sola unidad", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    listarInventarioSueltosConSaldoMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 120 },
      { galponId: GALPON_B_ID, loteId: LOTE_2_ID, cantidad: 90 },
    ]);
    consolidarSueltosRepoMock.mockResolvedValue({
      registro: { id: CONSOLIDACION_1_ID },
      creadas: [{ id: "p1" }],
    });

    const resultado = await consolidarPaqueteMixtoAction(inputBase);

    expect(resultado).toEqual({
      ok: true,
      data: { id: CONSOLIDACION_1_ID, unidadesCreadas: 1, totalConsolidado: 180 },
    });
    expect(consolidarSueltosRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        unidades: [
          {
            peso: 12.5,
            origenes: [
              { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 120 },
              { galponId: GALPON_B_ID, loteId: LOTE_2_ID, cantidad: 60 },
            ],
          },
        ],
      }),
    );
  });

  // Sin restricción de rol (decisión de negocio en spec.md), mismo
  // criterio que registrarRecoleccion.
  it("permite que un OPERARIO consolide, sin restricción de rol", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue({ ...sesionValida(), usuarioId: OPERARIO_1_ID });
    listarInventarioSueltosConSaldoMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 120 },
      { galponId: GALPON_B_ID, loteId: LOTE_2_ID, cantidad: 90 },
    ]);
    consolidarSueltosRepoMock.mockResolvedValue({
      registro: { id: CONSOLIDACION_1_ID },
      creadas: [{ id: "p1" }],
    });

    const resultado = await consolidarPaqueteMixtoAction(inputBase);

    expect(resultado.ok).toBe(true);
    expect(consolidarSueltosRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: OPERARIO_1_ID }),
    );
  });

  describe("idempotencia por id de cliente", () => {
    beforeEach(() => {
      listarInventarioSueltosConSaldoMock.mockResolvedValue([
        { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 120 },
        { galponId: GALPON_B_ID, loteId: LOTE_2_ID, cantidad: 90 },
      ]);
    });

    it("reintento con el mismo id y los mismos datos devuelve la consolidación ya existente, sin duplicar nada", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      consolidarSueltosRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarRegistroConsolidacionConUnidadesPorIdMock.mockResolvedValue({
        id: CONSOLIDACION_1_ID,
        cantidadUnidadesFormadas: 1,
        paquetes: [{ id: "p1" }],
        bandejas: [],
      });

      const resultado = await consolidarPaqueteMixtoAction(inputBase);

      expect(resultado).toEqual({
        ok: true,
        data: { id: CONSOLIDACION_1_ID, unidadesCreadas: 1, totalConsolidado: 180 },
      });
      expect(consolidarSueltosRepoMock).toHaveBeenCalledTimes(1);
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "RegistroConsolidacion", entidadId: CONSOLIDACION_1_ID }),
      );
    });

    it("rechaza explícito si el mismo id ya existe pero con otra cantidad de unidades formadas (no es un reintento legítimo)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      consolidarSueltosRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarRegistroConsolidacionConUnidadesPorIdMock.mockResolvedValue({
        id: CONSOLIDACION_1_ID,
        cantidadUnidadesFormadas: 2, // distinto de 1 (lo recalculado para inputBase)
        paquetes: [{ id: "p1" }, { id: "p2" }],
        bandejas: [],
      });

      const resultado = await consolidarPaqueteMixtoAction(inputBase);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe una consolidación con este id pero con datos diferentes — no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("propaga el error original si P2002 pero la consolidación no aparece en la lectura inmediata (caso imposible en la práctica)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      consolidarSueltosRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarRegistroConsolidacionConUnidadesPorIdMock.mockResolvedValue(null);

      await expect(consolidarPaqueteMixtoAction(inputBase)).rejects.toThrow("Unique constraint failed");
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("cualquier otro error de Prisma (no P2002) se propaga tal cual, sin pasar por la rama idempotente", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      consolidarSueltosRepoMock.mockRejectedValue(new Error("conexión perdida"));

      await expect(consolidarPaqueteMixtoAction(inputBase)).rejects.toThrow("conexión perdida");
      expect(buscarRegistroConsolidacionConUnidadesPorIdMock).not.toHaveBeenCalled();
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});

// No se repite el suite completo de arriba — la lógica compartida
// (ejecutarConsolidacion) ya queda cubierta por consolidarPaqueteMixtoAction.
// Acá solo se confirma que el wizard de Bandeja usa su propia unidad de
// destino (30, no 180) y su propio tipo/accion de AuditLog.
describe("consolidarBandejaAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("consolida sueltos en bandejas de 30 (no 180) y escribe AuditLog con su propia acción", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    listarInventarioSueltosConSaldoMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 75 },
    ]);
    consolidarSueltosRepoMock.mockResolvedValue({
      registro: { id: CONSOLIDACION_1_ID },
      creadas: [{ id: "b1" }, { id: "b2" }],
    });

    const resultado = await consolidarBandejaAction({
      id: CONSOLIDACION_1_ID,
      origenes: [{ galponId: GALPON_A_ID, loteId: LOTE_1_ID }],
      creadoEnCliente: new Date("2025-12-31T23:58:00.000Z"),
      pesos: [3.2, 3.3], // 75 = 30 + 30 + 15 sobrante -> 2 bandejas
    });

    expect(resultado).toEqual({
      ok: true,
      data: { id: CONSOLIDACION_1_ID, unidadesCreadas: 2, totalConsolidado: 60 },
    });
    expect(consolidarSueltosRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "BANDEJA" }),
    );
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "RegistroConsolidacion",
        accion: "CONSOLIDAR_BANDEJA",
        entidadId: CONSOLIDACION_1_ID,
      }),
    );
  });

  it("rechaza si no hay saldo suficiente para formar ni una bandeja completa (mínimo 30)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    listarInventarioSueltosConSaldoMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 10 },
    ]);

    const resultado = await consolidarBandejaAction({
      id: CONSOLIDACION_1_ID,
      origenes: [{ galponId: GALPON_A_ID, loteId: LOTE_1_ID }],
      creadoEnCliente: new Date("2025-12-31T23:58:00.000Z"),
      pesos: [3.2],
    });

    expect(resultado).toEqual({
      ok: false,
      error: "No hay saldo suficiente para formar al menos una bandeja completa (mínimo 30).",
    });
    expect(consolidarSueltosRepoMock).not.toHaveBeenCalled();
  });

  // Cubre la rama `existente.bandejas` del ternario de idempotencia
  // (server/actions/consolidacion.ts) — el suite de
  // consolidarPaqueteMixtoAction ya cubre `existente.paquetes`.
  it("reintento con el mismo id devuelve la bandeja ya existente, sin duplicar nada", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    listarInventarioSueltosConSaldoMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 30 },
    ]);
    consolidarSueltosRepoMock.mockRejectedValue(erroDeUnicidad());
    buscarRegistroConsolidacionConUnidadesPorIdMock.mockResolvedValue({
      id: CONSOLIDACION_1_ID,
      cantidadUnidadesFormadas: 1,
      paquetes: [],
      bandejas: [{ id: "b1" }],
    });

    const resultado = await consolidarBandejaAction({
      id: CONSOLIDACION_1_ID,
      origenes: [{ galponId: GALPON_A_ID, loteId: LOTE_1_ID }],
      creadoEnCliente: new Date("2025-12-31T23:58:00.000Z"),
      pesos: [3.2],
    });

    expect(resultado).toEqual({
      ok: true,
      data: { id: CONSOLIDACION_1_ID, unidadesCreadas: 1, totalConsolidado: 30 },
    });
    expect(consolidarSueltosRepoMock).toHaveBeenCalledTimes(1);
  });

  // Sin restricción de rol, mismo criterio que consolidarPaqueteMixtoAction.
  it("permite que un OPERARIO arme bandejas, sin restricción de rol", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue({ ...sesionValida(), usuarioId: OPERARIO_1_ID });
    listarInventarioSueltosConSaldoMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 30 },
    ]);
    consolidarSueltosRepoMock.mockResolvedValue({
      registro: { id: CONSOLIDACION_1_ID },
      creadas: [{ id: "b1" }],
    });

    const resultado = await consolidarBandejaAction({
      id: CONSOLIDACION_1_ID,
      origenes: [{ galponId: GALPON_A_ID, loteId: LOTE_1_ID }],
      creadoEnCliente: new Date("2025-12-31T23:58:00.000Z"),
      pesos: [3.2],
    });

    expect(resultado.ok).toBe(true);
    expect(consolidarSueltosRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: OPERARIO_1_ID }),
    );
  });
});
