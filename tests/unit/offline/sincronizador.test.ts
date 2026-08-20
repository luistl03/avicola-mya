import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listarParaEnviarMock,
  marcarEnviandoMock,
  marcarOkMock,
  marcarErrorMock,
  marcarPendienteMock,
} = vi.hoisted(() => ({
  listarParaEnviarMock: vi.fn(),
  marcarEnviandoMock: vi.fn(),
  marcarOkMock: vi.fn(),
  marcarErrorMock: vi.fn(),
  marcarPendienteMock: vi.fn(),
}));

vi.mock("@/lib/offline/cola", () => ({
  listarParaEnviar: listarParaEnviarMock,
  marcarEnviando: marcarEnviandoMock,
  marcarOk: marcarOkMock,
  marcarError: marcarErrorMock,
  marcarPendiente: marcarPendienteMock,
}));

import { sincronizarCola } from "@/lib/offline/sincronizador";

function item(id: string, tipo: "MORTALIDAD" | "BITACORA" | "RECOLECCION" = "MORTALIDAD") {
  return {
    id,
    tipo,
    payload: { id },
    estado: "PENDIENTE" as const,
    intentos: 0,
    creadoEnCliente: new Date(),
    actualizadoEn: new Date(),
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("sincronizarCola", () => {
  it("no llama a fetch si no hay ítems pendientes", async () => {
    listarParaEnviarMock.mockResolvedValue([]);

    await sincronizarCola();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("éxito completo: marca cada ítem OK según el resultado de /api/sync", async () => {
    listarParaEnviarMock.mockResolvedValue([item("a"), item("b")]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        resultados: [
          { idLocal: "a", ok: true, data: { id: "a" } },
          { idLocal: "b", ok: true, data: { id: "b" } },
        ],
      }),
    });

    await sincronizarCola();

    expect(marcarEnviandoMock).toHaveBeenCalledWith("a");
    expect(marcarEnviandoMock).toHaveBeenCalledWith("b");
    expect(marcarOkMock).toHaveBeenCalledWith("a");
    expect(marcarOkMock).toHaveBeenCalledWith("b");
    expect(marcarErrorMock).not.toHaveBeenCalled();
    expect(marcarPendienteMock).not.toHaveBeenCalled();
  });

  it("un ítem con rechazo de negocio queda en ERROR, no se reintenta como transitorio", async () => {
    listarParaEnviarMock.mockResolvedValue([item("a"), item("b")]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        resultados: [
          { idLocal: "a", ok: true, data: { id: "a" } },
          { idLocal: "b", ok: false, error: "El lote no existe." },
        ],
      }),
    });

    await sincronizarCola();

    expect(marcarOkMock).toHaveBeenCalledWith("a");
    expect(marcarErrorMock).toHaveBeenCalledWith("b", "El lote no existe.");
    expect(marcarPendienteMock).not.toHaveBeenCalled();
  });

  it("un rechazo de negocio sin mensaje de error usa el motivo genérico de respaldo", async () => {
    listarParaEnviarMock.mockResolvedValue([item("a")]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ resultados: [{ idLocal: "a", ok: false }] }),
    });

    await sincronizarCola();

    expect(marcarErrorMock).toHaveBeenCalledWith("a", "Error desconocido del servidor.");
  });

  it("fallo de red a mitad de lote vuelve todos los ítems a PENDIENTE, nunca a ERROR", async () => {
    listarParaEnviarMock.mockResolvedValue([item("a"), item("b")]);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await sincronizarCola();

    expect(marcarPendienteMock).toHaveBeenCalledWith("a");
    expect(marcarPendienteMock).toHaveBeenCalledWith("b");
    expect(marcarErrorMock).not.toHaveBeenCalled();
    expect(marcarOkMock).not.toHaveBeenCalled();
  });

  it("una respuesta HTTP no-ok (ej. 429 del rate limit) también vuelve el lote a PENDIENTE", async () => {
    listarParaEnviarMock.mockResolvedValue([item("a")]);
    fetchMock.mockResolvedValue({ ok: false, status: 429 });

    await sincronizarCola();

    expect(marcarPendienteMock).toHaveBeenCalledWith("a");
  });

  it("más de 25 ítems se envían en 2+ lotes separados", async () => {
    const items = Array.from({ length: 30 }, (_, i) => item(`id-${i}`));
    listarParaEnviarMock.mockResolvedValue(items);
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { items: { idLocal: string }[] };
      return {
        ok: true,
        json: async () => ({
          resultados: body.items.map((i) => ({ idLocal: i.idLocal, ok: true, data: {} })),
        }),
      };
    });

    await sincronizarCola();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(marcarOkMock).toHaveBeenCalledTimes(30);
  });

  it("un fallo de red en el primer lote no intenta el segundo lote", async () => {
    const items = Array.from({ length: 30 }, (_, i) => item(`id-${i}`));
    listarParaEnviarMock.mockResolvedValue(items);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await sincronizarCola();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(marcarPendienteMock).toHaveBeenCalledTimes(25);
  });
});
