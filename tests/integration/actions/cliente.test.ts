import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENTE_PUBLICO_GENERAL_ID } from "@/lib/constants";

// vi.hoisted: mismo patrón que tests/integration/actions/galpon.test.ts.
// La guard pura de server/services/cliente.ts (esClientePublicoGeneral) NO
// se mockea — se ejercita real, igual que puedeDesactivarGalpon en
// galpon.test.ts.
const {
  authMock,
  buscarSesionPorJtiMock,
  crearAuditLogMock,
  headersMock,
  buscarClientePorIdMock,
  crearClienteRepoMock,
  actualizarClienteMock,
  cambiarEstadoClienteMock,
  buscarClientesAutocompleteMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  buscarClientePorIdMock: vi.fn(),
  crearClienteRepoMock: vi.fn(),
  actualizarClienteMock: vi.fn(),
  cambiarEstadoClienteMock: vi.fn(),
  buscarClientesAutocompleteMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: vi.fn(),
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/cliente", () => ({
  buscarClientePorId: buscarClientePorIdMock,
  crearCliente: crearClienteRepoMock,
  actualizarCliente: actualizarClienteMock,
  cambiarEstadoCliente: cambiarEstadoClienteMock,
  buscarClientesAutocomplete: buscarClientesAutocompleteMock,
}));

import {
  buscarClientesAutocompleteAction,
  cambiarEstadoClienteAction,
  crearCliente,
  editarCliente,
} from "@/server/actions/cliente";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const CLIENTE_1_ID = crypto.randomUUID();
const CLIENTE_INEXISTENTE_ID = crypto.randomUUID();

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

function clienteBase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CLIENTE_1_ID,
    nombre: "Distribuidora El Sol",
    celular: "987654321",
    direccion: "Av. Principal 123",
    tipo: "MAYORISTA" as const,
    estado: "ACTIVO" as const,
    ...overrides,
  };
}

describe("Server Actions de cliente (Sprint 8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  describe("crearCliente", () => {
    const inputValido = {
      id: CLIENTE_1_ID,
      nombre: "Distribuidora El Sol",
      celular: "987654321",
      direccion: "Av. Principal 123",
      tipo: "MAYORISTA" as const,
    };

    it("crea el cliente y escribe AuditLog con entidad Cliente", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearClienteRepoMock.mockResolvedValue(clienteBase());

      const resultado = await crearCliente(inputValido);

      expect(resultado).toEqual({ ok: true, data: { id: CLIENTE_1_ID } });
      expect(crearClienteRepoMock).toHaveBeenCalledWith(inputValido);
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "Cliente", accion: "CREAR", entidadId: CLIENTE_1_ID }),
      );
    });

    it("un OPERARIO puede crear un cliente (sin restricción de rol)", async () => {
      authMock.mockResolvedValue(sessionOperario());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearClienteRepoMock.mockResolvedValue(clienteBase());

      const resultado = await crearCliente(inputValido);

      expect(resultado.ok).toBe(true);
    });

    // Idempotencia por id de cliente (spec.md, decisión de negocio: Cliente
    // no tiene ningún campo @unique).
    describe("idempotencia por id de cliente", () => {
      function erroDeUnicidad() {
        return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "6.19.3",
        });
      }

      it("reintento con el mismo id y los mismos datos devuelve el cliente ya existente, sin duplicar", async () => {
        authMock.mockResolvedValue(sessionGerente());
        buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
        crearClienteRepoMock.mockRejectedValue(erroDeUnicidad());
        buscarClientePorIdMock.mockResolvedValue(clienteBase());

        const resultado = await crearCliente(inputValido);

        expect(resultado).toEqual({ ok: true, data: { id: CLIENTE_1_ID } });
        expect(crearAuditLogMock).toHaveBeenCalledWith(
          expect.objectContaining({ entidad: "Cliente", entidadId: CLIENTE_1_ID }),
        );
      });

      it("reintento con celular/dirección sin mandar (undefined) contra una fila guardada sin esos datos (null) se trata como el mismo dato", async () => {
        authMock.mockResolvedValue(sessionGerente());
        buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
        crearClienteRepoMock.mockRejectedValue(erroDeUnicidad());
        buscarClientePorIdMock.mockResolvedValue(
          clienteBase({ celular: null, direccion: null }),
        );

        const resultado = await crearCliente({
          id: CLIENTE_1_ID,
          nombre: "Distribuidora El Sol",
          celular: undefined,
          direccion: undefined,
          tipo: "MAYORISTA",
        });

        expect(resultado.ok).toBe(true);
      });

      it("rechaza explícito si el mismo id ya existe pero con datos distintos", async () => {
        authMock.mockResolvedValue(sessionGerente());
        buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
        crearClienteRepoMock.mockRejectedValue(erroDeUnicidad());
        buscarClientePorIdMock.mockResolvedValue(clienteBase({ nombre: "Otro nombre" }));

        const resultado = await crearCliente(inputValido);

        expect(resultado).toEqual({
          ok: false,
          error: "Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.",
        });
        expect(crearAuditLogMock).not.toHaveBeenCalled();
      });

      it("propaga un error real que no es de unicidad (P2002), sin tratarlo como idempotencia", async () => {
        authMock.mockResolvedValue(sessionGerente());
        buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
        const errorDeConexion = new Error("Server has closed the connection");
        crearClienteRepoMock.mockRejectedValue(errorDeConexion);

        await expect(crearCliente(inputValido)).rejects.toThrow(errorDeConexion);
        expect(buscarClientePorIdMock).not.toHaveBeenCalled();
        expect(crearAuditLogMock).not.toHaveBeenCalled();
      });

      it("si el id colisiona (P2002) pero el registro ya no existe al releer, propaga el error original", async () => {
        authMock.mockResolvedValue(sessionGerente());
        buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
        const error = erroDeUnicidad();
        crearClienteRepoMock.mockRejectedValue(error);
        buscarClientePorIdMock.mockResolvedValue(null);

        await expect(crearCliente(inputValido)).rejects.toThrow(error);
        expect(crearAuditLogMock).not.toHaveBeenCalled();
      });
    });
  });

  describe("editarCliente", () => {
    const inputValido = {
      clienteId: CLIENTE_1_ID,
      nombre: "Nuevo nombre",
      celular: "999999999",
      direccion: "Nueva dirección",
      tipo: "MINORISTA" as const,
    };

    it("rechaza si el cliente no existe", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarClientePorIdMock.mockResolvedValue(null);

      const resultado = await editarCliente({ ...inputValido, clienteId: CLIENTE_INEXISTENTE_ID });

      expect(resultado).toEqual({ ok: false, error: "El cliente no existe." });
      expect(actualizarClienteMock).not.toHaveBeenCalled();
    });

    it("edita un cliente normal y escribe AuditLog con estadoAntes/estadoDespues", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarClientePorIdMock.mockResolvedValue(clienteBase());
      actualizarClienteMock.mockResolvedValue(
        clienteBase({ nombre: "Nuevo nombre", tipo: "MINORISTA" }),
      );

      const resultado = await editarCliente(inputValido);

      expect(resultado).toEqual({ ok: true, data: { id: CLIENTE_1_ID } });
      expect(actualizarClienteMock).toHaveBeenCalledWith(CLIENTE_1_ID, {
        nombre: "Nuevo nombre",
        celular: "999999999",
        direccion: "Nueva dirección",
        tipo: "MINORISTA",
      });
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: "Cliente",
          accion: "EDITAR",
          estadoAntes: { nombre: "Distribuidora El Sol", tipo: "MAYORISTA" },
          estadoDespues: { nombre: "Nuevo nombre", tipo: "MINORISTA" },
        }),
      );
    });

    it("rechaza editar a Público General, sin llegar a guardar", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarClientePorIdMock.mockResolvedValue(
        clienteBase({ id: CLIENTE_PUBLICO_GENERAL_ID, nombre: "Público General", tipo: "EVENTUAL" }),
      );

      const resultado = await editarCliente({ ...inputValido, clienteId: CLIENTE_PUBLICO_GENERAL_ID });

      expect(resultado).toEqual({ ok: false, error: "Público General no se puede editar." });
      expect(actualizarClienteMock).not.toHaveBeenCalled();
    });

    it("un OPERARIO puede editar un cliente (sin restricción de rol)", async () => {
      authMock.mockResolvedValue(sessionOperario());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarClientePorIdMock.mockResolvedValue(clienteBase());
      actualizarClienteMock.mockResolvedValue(clienteBase({ nombre: "Nuevo nombre" }));

      const resultado = await editarCliente(inputValido);

      expect(resultado.ok).toBe(true);
    });
  });

  describe("cambiarEstadoClienteAction", () => {
    it("rechaza si el cliente no existe", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarClientePorIdMock.mockResolvedValue(null);

      const resultado = await cambiarEstadoClienteAction({
        clienteId: CLIENTE_INEXISTENTE_ID,
        estado: "SUSPENDIDO",
      });

      expect(resultado).toEqual({ ok: false, error: "El cliente no existe." });
      expect(cambiarEstadoClienteMock).not.toHaveBeenCalled();
    });

    it("suspende un cliente ACTIVO", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarClientePorIdMock.mockResolvedValue(clienteBase({ estado: "ACTIVO" }));
      cambiarEstadoClienteMock.mockResolvedValue(clienteBase({ estado: "SUSPENDIDO" }));

      const resultado = await cambiarEstadoClienteAction({
        clienteId: CLIENTE_1_ID,
        estado: "SUSPENDIDO",
      });

      expect(resultado).toEqual({ ok: true, data: { id: CLIENTE_1_ID, estado: "SUSPENDIDO" } });
      expect(cambiarEstadoClienteMock).toHaveBeenCalledWith(CLIENTE_1_ID, "SUSPENDIDO");
    });

    it("reactiva un cliente SUSPENDIDO", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarClientePorIdMock.mockResolvedValue(clienteBase({ estado: "SUSPENDIDO" }));
      cambiarEstadoClienteMock.mockResolvedValue(clienteBase({ estado: "ACTIVO" }));

      const resultado = await cambiarEstadoClienteAction({ clienteId: CLIENTE_1_ID, estado: "ACTIVO" });

      expect(resultado).toEqual({ ok: true, data: { id: CLIENTE_1_ID, estado: "ACTIVO" } });
    });

    it("es no-op (sin tocar la base) si ya está en el estado pedido", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarClientePorIdMock.mockResolvedValue(clienteBase({ estado: "ACTIVO" }));

      const resultado = await cambiarEstadoClienteAction({ clienteId: CLIENTE_1_ID, estado: "ACTIVO" });

      expect(resultado).toEqual({ ok: true, data: { id: CLIENTE_1_ID, estado: "ACTIVO" } });
      expect(cambiarEstadoClienteMock).not.toHaveBeenCalled();
    });

    it("rechaza suspender a Público General, sin llegar a guardar", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarClientePorIdMock.mockResolvedValue(
        clienteBase({ id: CLIENTE_PUBLICO_GENERAL_ID, estado: "ACTIVO" }),
      );

      const resultado = await cambiarEstadoClienteAction({
        clienteId: CLIENTE_PUBLICO_GENERAL_ID,
        estado: "SUSPENDIDO",
      });

      expect(resultado).toEqual({ ok: false, error: "Público General no se puede suspender." });
      expect(cambiarEstadoClienteMock).not.toHaveBeenCalled();
    });

    it("un OPERARIO puede cambiar el estado de un cliente (sin restricción de rol)", async () => {
      authMock.mockResolvedValue(sessionOperario());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarClientePorIdMock.mockResolvedValue(clienteBase({ estado: "ACTIVO" }));
      cambiarEstadoClienteMock.mockResolvedValue(clienteBase({ estado: "SUSPENDIDO" }));

      const resultado = await cambiarEstadoClienteAction({
        clienteId: CLIENTE_1_ID,
        estado: "SUSPENDIDO",
      });

      expect(resultado.ok).toBe(true);
    });
  });

  // Sprint 9 (POS) — lectura disparada desde ClienteAutocomplete, sin
  // withAuth (mismo criterio que obtenerMasBitacora).
  describe("buscarClientesAutocompleteAction", () => {
    it("rechaza sin sesión, sin tocar el repository", async () => {
      authMock.mockResolvedValue(null);

      const resultado = await buscarClientesAutocompleteAction("Sol");

      expect(resultado).toEqual({ ok: false, error: "No autenticado." });
      expect(buscarClientesAutocompleteMock).not.toHaveBeenCalled();
    });

    it("con sesión válida, devuelve las sugerencias del repository", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarClientesAutocompleteMock.mockResolvedValue([clienteBase({ nombre: "Distribuidora El Sol" })]);

      const resultado = await buscarClientesAutocompleteAction("Sol");

      expect(resultado).toEqual({ ok: true, data: [clienteBase({ nombre: "Distribuidora El Sol" })] });
      expect(buscarClientesAutocompleteMock).toHaveBeenCalledWith("Sol");
    });

    it("un OPERARIO también puede buscar (sin restricción de rol)", async () => {
      authMock.mockResolvedValue(sessionOperario());
      buscarClientesAutocompleteMock.mockResolvedValue([]);

      const resultado = await buscarClientesAutocompleteAction("Sol");

      expect(resultado.ok).toBe(true);
    });

    it("una búsqueda vacía no es un error — responde sin sugerencias, sin tocar el repository", async () => {
      authMock.mockResolvedValue(sessionGerente());

      const resultado = await buscarClientesAutocompleteAction("");

      expect(resultado).toEqual({ ok: true, data: [] });
      expect(buscarClientesAutocompleteMock).not.toHaveBeenCalled();
    });

    it("no escribe AuditLog (es una lectura, no una mutación)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarClientesAutocompleteMock.mockResolvedValue([]);

      await buscarClientesAutocompleteAction("Sol");

      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});
