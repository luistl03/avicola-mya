import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: mismo patrón que tests/integration/actions/mortalidad.test.ts.
// ItemsNoDisponiblesError se re-declara acá (no se importa la clase real)
// porque el mock completo del módulo reemplaza también esa exportación —
// la action importa la misma clase mockeada, así que el `instanceof` sigue
// funcionando. server/services/venta.ts NO se mockea — se ejercita real,
// mismo criterio que las guards puras del resto de tests de integración.
const {
  authMock,
  buscarSesionPorJtiMock,
  crearAuditLogMock,
  headersMock,
  obtenerPrecioKiloVigenteMock,
  cerrarVentaRepoMock,
  buscarVentaConDetallesPorIdMock,
  buscarPaquetesPorIdsMock,
  buscarBandejasPorIdsMock,
  buscarPaquetesNoDisponiblesEntreIdsMock,
  buscarBandejasNoDisponiblesEntreIdsMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  obtenerPrecioKiloVigenteMock: vi.fn(),
  cerrarVentaRepoMock: vi.fn(),
  buscarVentaConDetallesPorIdMock: vi.fn(),
  buscarPaquetesPorIdsMock: vi.fn(),
  buscarBandejasPorIdsMock: vi.fn(),
  buscarPaquetesNoDisponiblesEntreIdsMock: vi.fn(),
  buscarBandejasNoDisponiblesEntreIdsMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: vi.fn(),
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/precioKilo", () => ({
  obtenerPrecioKiloVigente: obtenerPrecioKiloVigenteMock,
}));

vi.mock("@/server/repositories/venta", () => ({
  ItemsNoDisponiblesError: class ItemsNoDisponiblesError extends Error {},
  cerrarVenta: cerrarVentaRepoMock,
  buscarVentaConDetallesPorId: buscarVentaConDetallesPorIdMock,
  buscarPaquetesPorIds: buscarPaquetesPorIdsMock,
  buscarBandejasPorIds: buscarBandejasPorIdsMock,
  buscarPaquetesNoDisponiblesEntreIds: buscarPaquetesNoDisponiblesEntreIdsMock,
  buscarBandejasNoDisponiblesEntreIds: buscarBandejasNoDisponiblesEntreIdsMock,
}));

import { CLIENTE_PUBLICO_GENERAL_ID } from "@/lib/constants";
import { cerrarVentaAction } from "@/server/actions/venta";
import { ItemsNoDisponiblesError } from "@/server/repositories/venta";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const VENTA_1_ID = crypto.randomUUID();
const CLIENTE_1_ID = crypto.randomUUID();
const PAQUETE_1_ID = crypto.randomUUID();
const BANDEJA_1_ID = crypto.randomUUID();

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

function precioVigente(precio = 9.5) {
  return { id: crypto.randomUUID(), precio, vigenteDesde: AHORA, usuarioId: GERENTE_1_ID };
}

function detalleBase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    ventaId: VENTA_1_ID,
    tipo: "PAQUETE" as const,
    paqueteId: PAQUETE_1_ID,
    bandejaId: null,
    galponId: null,
    loteId: null,
    cantidadUnidades: null,
    pesoKg: 10,
    precioKiloAplicado: 9.5,
    subtotal: 95,
    ...overrides,
  };
}

function ventaBase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: VENTA_1_ID,
    clienteId: CLIENTE_1_ID,
    usuarioId: GERENTE_1_ID,
    fecha: AHORA,
    totalCobrado: 95,
    descuento: 0,
    metodoPago: "EFECTIVO" as const,
    montoContado: 95,
    montoCredito: null,
    credito: null,
    cliente: { nombre: "Distribuidora El Sol" },
    usuario: { nombre: "Gerente" },
    detalles: [detalleBase()],
    ...overrides,
  };
}

function erroDeUnicidad() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.3",
  });
}

describe("cerrarVentaAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  const inputValido = {
    id: VENTA_1_ID,
    clienteId: CLIENTE_1_ID,
    items: [{ tipo: "PAQUETE" as const, id: PAQUETE_1_ID }],
    descuento: 0,
    metodoPago: "EFECTIVO" as const,
  };

  it("cierra la venta, arma el comprobante completo en la respuesta, y escribe AuditLog con entidad Venta", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
    buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]);
    buscarBandejasPorIdsMock.mockResolvedValue([]);
    cerrarVentaRepoMock.mockResolvedValue(ventaBase());

    const resultado = await cerrarVentaAction(inputValido);

    expect(resultado).toEqual({
      ok: true,
      data: {
        id: VENTA_1_ID,
        fecha: AHORA.toISOString(),
        clienteNombre: "Distribuidora El Sol",
        vendedorNombre: "Gerente",
        totalCobrado: 95,
        descuento: 0,
        metodoPago: "EFECTIVO",
        esCredito: false,
        montoContado: 95,
        montoCredito: null,
        fechaLimiteCredito: null,
        montoPagado: null,
        abonos: [],
        items: [{ tipo: "PAQUETE", pesoKg: 10, precioKiloAplicado: 9.5, subtotal: 95 }],
      },
    });
    expect(cerrarVentaRepoMock).toHaveBeenCalledWith({
      id: VENTA_1_ID,
      clienteId: CLIENTE_1_ID,
      usuarioId: GERENTE_1_ID,
      items: [{ tipo: "PAQUETE", id: PAQUETE_1_ID, pesoKg: 10, precioKiloAplicado: 9.5, subtotal: 95 }],
      descuento: 0,
      totalCobrado: 95,
      metodoPago: "EFECTIVO",
      ahora: AHORA,
      credito: undefined,
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "Venta", accion: "CREAR", entidadId: VENTA_1_ID }),
    );
  });

  // Todos los demás casos usan un carrito con un solo Paquete — este cubre
  // la rama real de un carrito MIXTO (Paquete + Bandeja a la vez), que
  // ejercita buscarBandejasPorIds con una lista no vacía (hallazgo de
  // cobertura de S9-15: ningún otro test lo hacía).
  it("cierra una venta con un carrito mixto (Paquete + Bandeja)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
    buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]);
    buscarBandejasPorIdsMock.mockResolvedValue([{ id: BANDEJA_1_ID, peso: 2 }]);
    cerrarVentaRepoMock.mockResolvedValue(
      ventaBase({
        totalCobrado: 114,
        detalles: [
          detalleBase(),
          detalleBase({
            tipo: "BANDEJA",
            paqueteId: null,
            bandejaId: BANDEJA_1_ID,
            pesoKg: 2,
            subtotal: 19,
          }),
        ],
      }),
    );

    const resultado = await cerrarVentaAction({
      ...inputValido,
      items: [
        { tipo: "PAQUETE", id: PAQUETE_1_ID },
        { tipo: "BANDEJA", id: BANDEJA_1_ID },
      ],
    });

    expect(resultado.ok).toBe(true);
    expect(cerrarVentaRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          { tipo: "PAQUETE", id: PAQUETE_1_ID, pesoKg: 10, precioKiloAplicado: 9.5, subtotal: 95 },
          { tipo: "BANDEJA", id: BANDEJA_1_ID, pesoKg: 2, precioKiloAplicado: 9.5, subtotal: 19 },
        ],
        totalCobrado: 114,
      }),
    );
  });

  // Cubre la rama contraria a la del resto de los tests (paqueteIds vacío,
  // solo bandejaIds) — hallazgo de cobertura de S9-15.
  it("cierra una venta con un carrito de solo Bandeja (sin Paquete)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
    buscarPaquetesPorIdsMock.mockResolvedValue([]);
    buscarBandejasPorIdsMock.mockResolvedValue([{ id: BANDEJA_1_ID, peso: 2 }]);
    cerrarVentaRepoMock.mockResolvedValue(
      ventaBase({
        totalCobrado: 19,
        detalles: [detalleBase({ tipo: "BANDEJA", paqueteId: null, bandejaId: BANDEJA_1_ID, pesoKg: 2, subtotal: 19 })],
      }),
    );

    const resultado = await cerrarVentaAction({
      ...inputValido,
      items: [{ tipo: "BANDEJA", id: BANDEJA_1_ID }],
    });

    expect(resultado.ok).toBe(true);
    expect(buscarPaquetesPorIdsMock).not.toHaveBeenCalled();
    expect(cerrarVentaRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ tipo: "BANDEJA", id: BANDEJA_1_ID, pesoKg: 2, precioKiloAplicado: 9.5, subtotal: 19 }],
      }),
    );
  });

  it("un OPERARIO puede cerrar una venta (sin restricción de rol)", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente());
    buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]);
    buscarBandejasPorIdsMock.mockResolvedValue([]);
    cerrarVentaRepoMock.mockResolvedValue(ventaBase());

    const resultado = await cerrarVentaAction(inputValido);

    expect(resultado.ok).toBe(true);
  });

  it("rechaza si no hay ningún precio por kilo configurado, sin tocar el resto de repositories", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    obtenerPrecioKiloVigenteMock.mockResolvedValue(null);

    const resultado = await cerrarVentaAction(inputValido);

    expect(resultado).toEqual({ ok: false, error: "No hay ningún precio por kilo configurado." });
    expect(buscarPaquetesPorIdsMock).not.toHaveBeenCalled();
    expect(cerrarVentaRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza si un ítem del carrito ya no existe (id inválido o borrado)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente());
    buscarPaquetesPorIdsMock.mockResolvedValue([]); // no encontró el paquete pedido
    buscarBandejasPorIdsMock.mockResolvedValue([]);

    const resultado = await cerrarVentaAction(inputValido);

    expect(resultado).toEqual({
      ok: false,
      error: "Uno o más ítems del carrito ya no existen - actualiza el selector.",
    });
    expect(cerrarVentaRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza un descuento que supera el bruto de la venta", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
    buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]); // bruto = 95
    buscarBandejasPorIdsMock.mockResolvedValue([]);

    const resultado = await cerrarVentaAction({ ...inputValido, descuento: 100 });

    expect(resultado).toEqual({ ok: false, error: "El descuento no puede superar el total de la venta." });
    expect(cerrarVentaRepoMock).not.toHaveBeenCalled();
  });

  it("traduce ItemsNoDisponiblesError (carrera anti-doble-venta) a un mensaje con los ids específicos", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
    buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]);
    buscarBandejasPorIdsMock.mockResolvedValue([]);
    cerrarVentaRepoMock.mockRejectedValue(new ItemsNoDisponiblesError());
    buscarPaquetesNoDisponiblesEntreIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID }]);
    buscarBandejasNoDisponiblesEntreIdsMock.mockResolvedValue([]);

    const resultado = await cerrarVentaAction(inputValido);

    expect(resultado).toEqual({
      ok: false,
      error: `Estos ítems ya no están disponibles: ${PAQUETE_1_ID}. Actualiza el carrito.`,
    });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });

  // Cubre las ramas contrarias del bloque de diagnóstico (paqueteIds
  // vacío, bandejaIds con datos) — hallazgo de cobertura de S9-15, mismo
  // motivo que el test de "carrito de solo Bandeja" de más arriba.
  it("traduce ItemsNoDisponiblesError con un carrito de solo Bandeja", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
    buscarPaquetesPorIdsMock.mockResolvedValue([]);
    buscarBandejasPorIdsMock.mockResolvedValue([{ id: BANDEJA_1_ID, peso: 2 }]);
    cerrarVentaRepoMock.mockRejectedValue(new ItemsNoDisponiblesError());
    buscarBandejasNoDisponiblesEntreIdsMock.mockResolvedValue([{ id: BANDEJA_1_ID }]);

    const resultado = await cerrarVentaAction({
      ...inputValido,
      items: [{ tipo: "BANDEJA", id: BANDEJA_1_ID }],
    });

    expect(resultado).toEqual({
      ok: false,
      error: `Estos ítems ya no están disponibles: ${BANDEJA_1_ID}. Actualiza el carrito.`,
    });
    expect(buscarPaquetesNoDisponiblesEntreIdsMock).not.toHaveBeenCalled();
  });

  // Idempotencia por id de cliente (spec.md — Venta no tiene ningún campo
  // @unique).
  describe("idempotencia por id de cliente", () => {

    it("reintento con el mismo id y el mismo carrito devuelve la venta ya existente, sin duplicar", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
      buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]);
      buscarBandejasPorIdsMock.mockResolvedValue([]);
      cerrarVentaRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarVentaConDetallesPorIdMock.mockResolvedValue(ventaBase());

      const resultado = await cerrarVentaAction(inputValido);

      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.data.id).toBe(VENTA_1_ID);
      }
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "Venta", entidadId: VENTA_1_ID }),
      );
    });

    it("rechaza explícito si el mismo id ya existe con un carrito distinto", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
      buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]);
      buscarBandejasPorIdsMock.mockResolvedValue([]);
      cerrarVentaRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarVentaConDetallesPorIdMock.mockResolvedValue(
        ventaBase({ detalles: [detalleBase({ paqueteId: crypto.randomUUID() })] }),
      );

      const resultado = await cerrarVentaAction(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    // Rama defensiva (comentario real en server/actions/venta.ts: "nunca
    // real este sprint, SUELTO no se puebla hasta Sprint 10") — un detalle
    // sin paqueteId NI bandejaId no debería existir todavía, pero si
    // pasara, el sentinel `?? ""` evita que se compare `undefined` contra
    // `undefined` y dé un falso "coincide". Vale la pena confirmarla con un
    // test barato en vez de dejarla sin ejercitar (mismo criterio que
    // S8-15).
    it("rechaza explícito si el registro existente tiene un detalle sin paqueteId ni bandejaId (defensivo)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
      buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]);
      buscarBandejasPorIdsMock.mockResolvedValue([]);
      cerrarVentaRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarVentaConDetallesPorIdMock.mockResolvedValue(
        ventaBase({ detalles: [detalleBase({ paqueteId: null, bandejaId: null })] }),
      );

      const resultado = await cerrarVentaAction(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.",
      });
    });

    it("rechaza explícito si el mismo id ya existe con otro cliente", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
      buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]);
      buscarBandejasPorIdsMock.mockResolvedValue([]);
      cerrarVentaRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarVentaConDetallesPorIdMock.mockResolvedValue(ventaBase({ clienteId: crypto.randomUUID() }));

      const resultado = await cerrarVentaAction(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.",
      });
    });

    it("propaga un error real que no es de unicidad (P2002), sin tratarlo como idempotencia", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
      buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]);
      buscarBandejasPorIdsMock.mockResolvedValue([]);
      const errorDeConexion = new Error("Server has closed the connection");
      cerrarVentaRepoMock.mockRejectedValue(errorDeConexion);

      await expect(cerrarVentaAction(inputValido)).rejects.toThrow(errorDeConexion);
      expect(buscarVentaConDetallesPorIdMock).not.toHaveBeenCalled();
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("si el id colisiona (P2002) pero el registro ya no existe al releer, propaga el error original", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
      buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]);
      buscarBandejasPorIdsMock.mockResolvedValue([]);
      const error = erroDeUnicidad();
      cerrarVentaRepoMock.mockRejectedValue(error);
      buscarVentaConDetallesPorIdMock.mockResolvedValue(null);

      await expect(cerrarVentaAction(inputValido)).rejects.toThrow(error);
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });

  // Sprint 11 — venta a crédito (total o parcial). Los tests de arriba
  // (100% al contado, esCredito por defecto en false) no cambiaron ni una
  // aserción — confirma que esta extensión no rompe el comportamiento de
  // Sprint 9.
  describe("venta a crédito (Sprint 11)", () => {
    it("venta a crédito total (montoContado: 0) crea el Credito con montoTotal = totalCobrado", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
      buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]);
      buscarBandejasPorIdsMock.mockResolvedValue([]);
      const fechaLimite = new Date("2026-02-01T00:00:00.000Z");
      cerrarVentaRepoMock.mockResolvedValue(
        ventaBase({
          montoContado: 0,
          montoCredito: 95,
          credito: { fechaLimite },
        }),
      );

      const resultado = await cerrarVentaAction({
        ...inputValido,
        esCredito: true,
        montoContado: 0,
        fechaLimiteCredito: fechaLimite,
      });

      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.data.esCredito).toBe(true);
        expect(resultado.data.montoContado).toBe(0);
        expect(resultado.data.montoCredito).toBe(95);
      }
      expect(cerrarVentaRepoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          credito: { montoContado: 0, montoCredito: 95, fechaLimite },
        }),
      );
    });

    it("venta a crédito parcial: Credito.montoTotal es SOLO el saldo a crédito, no el total de la venta", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
      buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]); // bruto = 95
      buscarBandejasPorIdsMock.mockResolvedValue([]);
      const fechaLimite = new Date("2026-02-01T00:00:00.000Z");
      cerrarVentaRepoMock.mockResolvedValue(
        ventaBase({ montoContado: 35, montoCredito: 60, credito: { fechaLimite } }),
      );

      const resultado = await cerrarVentaAction({
        ...inputValido,
        esCredito: true,
        montoContado: 35,
        fechaLimiteCredito: fechaLimite,
      });

      expect(resultado.ok).toBe(true);
      expect(cerrarVentaRepoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          credito: { montoContado: 35, montoCredito: 60, fechaLimite },
        }),
      );
    });

    it("rechaza una venta a crédito a Público General, antes de cualquier cálculo (no toca obtenerPrecioKiloVigente)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());

      const resultado = await cerrarVentaAction({
        ...inputValido,
        clienteId: CLIENTE_PUBLICO_GENERAL_ID,
        esCredito: true,
        montoContado: 0,
        fechaLimiteCredito: new Date("2026-02-01T00:00:00.000Z"),
      });

      expect(resultado).toEqual({ ok: false, error: "No se puede vender a crédito a Público General." });
      expect(obtenerPrecioKiloVigenteMock).not.toHaveBeenCalled();
      expect(cerrarVentaRepoMock).not.toHaveBeenCalled();
    });

    it("rechaza un montoContado mayor al total cobrado de la venta", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
      buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]); // totalCobrado = 95
      buscarBandejasPorIdsMock.mockResolvedValue([]);

      const resultado = await cerrarVentaAction({
        ...inputValido,
        esCredito: true,
        montoContado: 100,
        fechaLimiteCredito: new Date("2026-02-01T00:00:00.000Z"),
      });

      expect(resultado).toEqual({
        ok: false,
        error: "El monto al contado no puede superar el total de la venta.",
      });
      expect(cerrarVentaRepoMock).not.toHaveBeenCalled();
    });

    it("reintento idempotente de una venta a crédito con los mismos datos responde éxito, sin duplicar", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
      buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]); // totalCobrado = 95
      buscarBandejasPorIdsMock.mockResolvedValue([]);
      cerrarVentaRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarVentaConDetallesPorIdMock.mockResolvedValue(
        ventaBase({ montoContado: 35, montoCredito: 60, credito: { fechaLimite: new Date("2026-02-01") } }),
      );

      const resultado = await cerrarVentaAction({
        ...inputValido,
        esCredito: true,
        montoContado: 35,
        fechaLimiteCredito: new Date("2026-02-01"),
      });

      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.data.id).toBe(VENTA_1_ID);
      }
    });

    // Rama defensiva, mismo criterio que el sentinel `?? ""` de arriba
    // (paqueteId/bandejaId): Venta.montoContado nunca es null en la
    // práctica (cerrarVenta siempre lo setea), pero si pasara, no debe
    // compararse como si "coincidiera" con un montoContado numérico real.
    it("rechaza explícito si el registro existente tiene montoContado null (defensivo)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      obtenerPrecioKiloVigenteMock.mockResolvedValue(precioVigente(9.5));
      buscarPaquetesPorIdsMock.mockResolvedValue([{ id: PAQUETE_1_ID, peso: 10 }]);
      buscarBandejasPorIdsMock.mockResolvedValue([]);
      cerrarVentaRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarVentaConDetallesPorIdMock.mockResolvedValue(ventaBase({ montoContado: null }));

      const resultado = await cerrarVentaAction(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.",
      });
    });
  });
});
